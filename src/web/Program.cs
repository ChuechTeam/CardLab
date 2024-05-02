using System.Reflection;
using System.Text.Json;
using System.Text.Json.Serialization;
using CardLab.Auth;
using CardLab.Game;
using CardLab.Game.AssetPacking;
using CardLab.Game.BasePacks;
using CardLab.Game.Duels;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Extensions.FileProviders;
using Vite.AspNetCore.Extensions;

[assembly: ApiController]

var builder = WebApplication.CreateBuilder(args);

if (Environment.GetEnvironmentVariable("CL_APPSETTINGS") is { } path)
{
    builder.Configuration.AddJsonFile(path, false);
}

// Add services to the container.
builder.Services.AddAuthentication()
    .AddScheme<GameAuthenticationOptions, GameAuthenticationHandler>("Game", o => { });
builder.Services.AddAuthorization(o =>
{
    o.AddPolicy("InGame", p => { p.RequireAuthenticatedUser(); });
    o.AddPolicy("Host", p => { p.RequireClaim("IsHost", "true"); });
});
var createGameRoute = builder.Configuration.GetSection("CreateGameRoute").Get<string>() ?? "/create-game";
var b = builder.Services
    .AddRazorPages(options =>
    {
        options.Conventions.AuthorizeFolder("/Game", "InGame");

        options.Conventions.AddPageRouteModelConvention("/CreateGame", a =>
        {
            a.Selectors.Clear();
        });
        options.Conventions.AddPageRoute("/CreateGame", createGameRoute);
    });

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
builder.Services.AddResponseCompression(options =>
{
    options.EnableForHttps = true;
});

builder.Services.AddSingleton<ServerState>();
builder.Services.AddSingleton<BasePackRegistry>();
builder.Services.AddSingleton<GamePackCompiler>();
builder.Services.AddSingleton<GamePackCompileQueue>();
builder.Services.AddSingleton<WebGamePacker>();
builder.Services.AddHostedService<GamePackCompileWorker>();
//builder.Services.AddOptions<GameRequestQueue>(GameRequestQueue.Options.Section);
// builder.Services.AddSingleton<GameRequestQueue>();
// builder.Services.AddHostedService<GameRequestWorker>();

if (builder.Environment.IsDevelopment() || builder.Environment.IsStaging())
{
    builder.Services.AddSingleton<GlobalDuelTest>();
}

builder.Services.AddViteServices(opt => { opt.PackageDirectory = "Client/card-lab"; });

var app = builder.Build();
var isDev = app.Environment.IsDevelopment();

// Compile all base packs before launching the app. Always does that works in development mode.
// In production, the deployment script should run the app with "--compile" before bundling the container.
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
    
    await basePackRegistry.CompilePack(BasePack1.PackId, BasePack1.Name, BasePack1.PackVersion,
        BasePack1.GetCards(assetsDir), "basePack1");

    if (!isDev)
    {
        return;
    }
}
else
{
    await basePackRegistry.FindPacks();
}


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

var packsPath = Path.Combine(builder.Environment.ContentRootPath, WebGamePacker.ContentRootSubDir);
Directory.CreateDirectory(packsPath);
app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = clTypes,
    FileProvider = new PhysicalFileProvider(packsPath),
    RequestPath = new PathString("/" + WebGamePacker.WebSubDir)
});

app.UseRouting();

app.UseAuthorization();

app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

app.MapRazorPages();
app.MapControllers();

await app.RunAsync();