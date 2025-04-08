using System.Globalization;
using System.Net;
using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using CardLab;
using CardLab.Auth;
using CardLab.Game;
using CardLab.Game.AssetPacking;
using CardLab.Game.BasePacks;
using CardLab.Game.Duels;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Options;
using Vite.AspNetCore.Extensions;

[assembly: ApiController]

// ------------------------------
// APP CONFIGURATION
// ------------------------------

var builder = WebApplication.CreateBuilder(args);

// Allow setting the CL_APPSETTINGS environment variable to a JSON file path to load settings.
if (Environment.GetEnvironmentVariable("CL_APPSETTINGS") is { } path)
{
    builder.Configuration.AddJsonFile(path, false);
}

// Retrieve the abuse protection options now, so we can use it to setup services.
var abuseOpt = new AbuseProtectionOptions();
builder.Configuration.GetSection(AbuseProtectionOptions.Section).Bind(abuseOpt);

// ------------------------------
// APP SERVICES
// ------------------------------

builder.Services.AddAuthentication()
    .AddScheme<GameAuthenticationOptions, GameAuthenticationHandler>("Game", o => { });
builder.Services.AddAuthorization(o =>
{
    o.AddPolicy("InGame", p => { p.RequireAuthenticatedUser(); });
    o.AddPolicy("Host", p => { p.RequireClaim("IsHost", "true"); });
});
var b = builder.Services
    .AddRazorPages(options => { options.Conventions.AuthorizeFolder("/Game", "InGame"); });

#if DEBUG
b.AddRazorRuntimeCompilation();
#endif

var configJson = (JsonSerializerOptions o) =>
{
    var conv = new JsonStringEnumConverter(JsonNamingPolicy.CamelCase);
    o.Converters.Add(conv);
};
builder.Services.ConfigureHttpJsonOptions(x => configJson(x.SerializerOptions));
builder.Services.AddControllers().AddJsonOptions(x => configJson(x.JsonSerializerOptions));
builder.Services.AddRouting(r =>
{
    r.LowercaseUrls = true;
    r.LowercaseQueryStrings = true;
});
builder.Services.AddOptions<GameSessionSettings>().BindConfiguration(GameSessionSettings.Section);
builder.Services.AddOptions<GamePackingOptions>().BindConfiguration(GamePackingOptions.Section);
builder.Services.AddResponseCompression(options => { options.EnableForHttps = true; });
builder.Services.AddSingleton<ServerState>();
builder.Services.AddSingleton<BasePackRegistry>();
builder.Services.AddSingleton<GamePackCompiler>();
builder.Services.AddSingleton<GamePackCompileQueue>();
builder.Services.AddSingleton<WebGamePacker>();
builder.Services.AddHostedService<GamePackCompileWorker>();
//builder.Services.AddOptions<GameRequestQueue>(GameRequestQueue.Options.Section);
// builder.Services.AddSingleton<GameRequestQueue>();
// builder.Services.AddHostedService<GameRequestWorker>();

#if DEBUG
builder.Services.AddSingleton<GlobalDuelTest>();
#endif

builder.Services.AddViteServices(opt => { opt.PackageDirectory = "Client/card-lab"; });

// ------------------------------
// ABUSE PROTECTION: Rate limits and the like
// ------------------------------

// Taken from
// https://learn.microsoft.com/en-us/aspnet/core/performance/rate-limit?view=aspnetcore-8.0#rate-limiter-samples
static FixedWindowRateLimiterOptions RateLimitOptions(RateLimit rl)
{
    return new FixedWindowRateLimiterOptions
    {
        Window = TimeSpan.FromSeconds(rl.WindowSeconds),
        PermitLimit = rl.MaxRequests,
        QueueLimit = 4
    };
}

var includeLocal = abuseOpt.IncludeLoopbackIPs;
RateLimitPartition<IPAddress> ByIP(HttpContext ctx, RateLimit rl)
{
    IPAddress? remoteIpAddress = ctx.Connection.RemoteIpAddress;

    if (!IPAddress.IsLoopback(remoteIpAddress!) || includeLocal)
    {
        return RateLimitPartition.GetFixedWindowLimiter(
            remoteIpAddress!, _ => RateLimitOptions(rl));
    }

    return RateLimitPartition.GetNoLimiter(IPAddress.Loopback);
}


builder.Services.AddRateLimiter(limiterOptions =>
{
    limiterOptions.OnRejected = (context, _) =>
    {
        context.HttpContext.Response.StatusCode = StatusCodes.Status429TooManyRequests;
        context.HttpContext.Response.WriteAsync("Too many requests. Please try again later.");
        return new ValueTask();
    };

    limiterOptions.GlobalLimiter =
        PartitionedRateLimiter.Create<HttpContext, IPAddress>(context => ByIP(context, abuseOpt.GeneralLimit));

    limiterOptions.AddPolicy("GameCreation", ctx => ByIP(ctx, abuseOpt.GameCreationLimit));

    limiterOptions.AddPolicy("CardUpload", ctx => ByIP(ctx, abuseOpt.CardUploadLimit));
});

// ------------------------------
// GAME PACK COMPILATION/LOADING
// ------------------------------

var app = builder.Build();
var isDev = app.Environment.IsDevelopment();

// Compile all base packs before launching the app. Always does that in development mode.
// In production, the deployment script should run the app with "--compile" before bundling the container.
MainPack.InitScripts();
var basePackRegistry = app.Services.GetRequiredService<BasePackRegistry>();
if (args.ElementAtOrDefault(0) == "--compile" || isDev)
{
    string assetsDir;
    if (isDev)
    {
        assetsDir = Path.Combine(app.Environment.ContentRootPath, "Game/BasePacks/Assets");
    }
    else
    {
        assetsDir = args.ElementAtOrDefault(1) ?? throw new InvalidOperationException("No assets directory provided.");
    }

    basePackRegistry.ClearPacks();

#if DEBUG
    await basePackRegistry.CompilePack(TestPack.PackId, TestPack.Name, TestPack.PackVersion,
        TestPack.GetCards(assetsDir), "testPack");
#endif

    await basePackRegistry.CompilePack(MainPack.PackId, MainPack.Name, MainPack.PackVersion,
        MainPack.GetCards(assetsDir), "mainPack");

    if (!isDev)
    {
        return;
    }
}
else
{
    await basePackRegistry.FindPacks();
}

// ------------------------------
// APP REQUEST PIPELINE
// ------------------------------

// Configure the HTTP request pipeline.
if (!isDev)
{
    app.UseExceptionHandler("/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

if (app.Environment.IsDevelopment())
{
    app.UseViteDevelopmentServer(true);
}

app.UseHttpsRedirection();
app.UseResponseCompression();

var clTypes = new FileExtensionContentTypeProvider
{
    Mappings =
    {
        ["." + GamePack.PackDefFileExt] = GamePack.PackDefMime,
        ["." + GamePack.PackResFileExt] = GamePack.PackResMime
    }
};
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = clTypes
});

var packOpt = app.Services.GetRequiredService<IOptions<GamePackingOptions>>().Value;
var packStoragePath = packOpt.ResolveStoragePath(app.Environment);
// Create the pack storage folder beforehand, if it doesn't yet exist.
Directory.CreateDirectory(packStoragePath);
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = clTypes,
    FileProvider = new PhysicalFileProvider(packStoragePath),
    RequestPath = new PathString("/" + packOpt.RouteUri)
});

app.UseRouting();
app.UseRateLimiter();

app.UseAuthorization();

app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

app.MapRazorPages();
app.MapControllers();

await app.RunAsync();