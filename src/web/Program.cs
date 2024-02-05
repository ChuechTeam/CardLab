using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Mvc;

[assembly: ApiController]

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddAuthentication()
    .AddScheme<GameAuthenticationOptions, GameAuthenticationHandler>("Game", o => { });
builder.Services.AddAuthorization(o =>
{
    o.AddPolicy("InGame", p =>
    {
        p.RequireAuthenticatedUser();
    });
});
builder.Services.AddRazorPages(options =>
{
    options.Conventions.AuthorizeFolder("/Game", "InGame");
});
builder.Services.AddControllers();
builder.Services.AddRouting(r =>
{
    r.LowercaseUrls = true;
    r.LowercaseQueryStrings = true;
});

builder.Services.AddSingleton<ServerState>();

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

app.MapRazorPages();
app.MapControllers();

app.Run();