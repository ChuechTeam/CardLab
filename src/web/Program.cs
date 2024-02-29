using System.Text.Json;
using System.Text.Json.Serialization;
using CardLab.Auth;
using CardLab.Game;
using CardLab.Game.AssetPacking;
using CardLab.Game.BasePacks;
using CardLab.Game.Duels;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using Vite.AspNetCore.Extensions;
using JsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;

[assembly: ApiController]

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddAuthentication()
    .AddScheme<GameAuthenticationOptions, GameAuthenticationHandler>("Game", o => { });
builder.Services.AddAuthorization(o =>
{
    o.AddPolicy("InGame", p => { p.RequireAuthenticatedUser(); });
    o.AddPolicy("Host", p => { p.RequireClaim("IsHost", "true"); });
});
builder.Services.AddRazorPages(options => { options.Conventions.AuthorizeFolder("/Game", "InGame"); });
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

builder.Services.AddSingleton<ServerState>();
builder.Services.AddSingleton<CardBalancer>();
builder.Services.AddSingleton<BasePackRegistry>();
builder.Services.AddSingleton<GlobalDuelTest>();

builder.Services.AddViteServices(opt =>
{
    opt.PackageDirectory = "Client/card-lab";
});

var app = builder.Build();

// Compile all base packs before launching the app. Only works in development mode for now!
// Later on we should just read all the compiled packs in production mode, and run the app
// to compile the packs before deploying.
var basePackRegistry = app.Services.GetRequiredService<BasePackRegistry>();

var assetsDir = Path.Combine(app.Environment.ContentRootPath, "Game/BasePacks/Assets");
await basePackRegistry.CompilePack(BasePack1.PackId, BasePack1.Name, BasePack1.PackVersion,
    BasePack1.GetCards(assetsDir), "basePack1");

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
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

app.UseStaticFiles(new StaticFileOptions
{
    ContentTypeProvider = new FileExtensionContentTypeProvider
    {
        Mappings =
        {
            ["." + GamePack.PackDefFileExt] = GamePack.PackDefMime,
            ["." + GamePack.PackResFileExt] = GamePack.PackResMime
        }
    }
});

app.UseRouting();

app.UseAuthorization();

app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

app.MapRazorPages();
app.MapControllers();

await app.RunAsync();