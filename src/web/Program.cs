using System.Text.Json;
using System.Text.Json.Serialization;
using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Mvc;
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

var app = builder.Build();

// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Error");
    // The default HSTS value is 30 days. You may want to change this for production scenarios, see https://aka.ms/aspnetcore-hsts.
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseStaticFiles();

app.UseRouting();

app.UseAuthorization();

app.UseWebSockets(new WebSocketOptions { KeepAliveInterval = TimeSpan.FromSeconds(30) });

app.MapRazorPages();
app.MapControllers();

app.Run();