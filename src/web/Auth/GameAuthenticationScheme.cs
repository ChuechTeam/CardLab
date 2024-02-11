using System.Security.Claims;
using System.Text.Encodings.Web;
using CardLab.Game;
using CardLab.Game.Communication;
using Microsoft.AspNetCore.Authentication;
using Microsoft.Extensions.Options;

namespace CardLab.Auth;

public class GameAuthenticationOptions : AuthenticationSchemeOptions
{
    public string UserTokenCookieName { get; set; } = "CLUserToken";
    public string GameIdCookieName { get; set; } = "CLGameId";
}

public sealed class GameUserPrincipal : ClaimsPrincipal
{
    public GameUserPrincipal(GameSession session, Player? player)
    {
        GameSession = session;
        GameId = session.Id;
        Player = player;
        PlayerId = player?.Id;
        var id = new ClaimsIdentity(null, "Game");
        id.AddClaim(new Claim("Name", $"{GameId};{player?.Id ?? -1}"));
        if (IsHost)
        {
            id.AddClaim(new Claim("IsHost", "true"));
        }
        AddIdentity(id);
    }

    public int GameId { get; }
    public Player? Player { get; }
    public int? PlayerId { get; }

    public UserSocket Socket => Player?.Socket ?? GameSession.HostSocket;

    public GameSession GameSession { get; }

    public bool IsHost => PlayerId == null;
}

public class GameAuthenticationHandler : AuthenticationHandler<GameAuthenticationOptions>, IAuthenticationSignInHandler
{
    private readonly ServerState _state;

    public GameAuthenticationHandler(IOptionsMonitor<GameAuthenticationOptions> options, ILoggerFactory logger,
        UrlEncoder encoder, ServerState state) : base(options, logger, encoder)
    {
        _state = state;
    }

    protected override Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        if (!Request.Cookies.TryGetValue(Options.GameIdCookieName, out var gameIdStr) ||
            !Request.Cookies.TryGetValue(Options.UserTokenCookieName, out var sessionTokenStr))
        {
            return Task.FromResult(AuthenticateResult.Fail("Not in a game"));
        }

        Task<AuthenticateResult> FailAndReset(string msg)
        {
            Response.Cookies.Delete(Options.GameIdCookieName);
            Response.Cookies.Delete(Options.UserTokenCookieName);
            return Task.FromResult(AuthenticateResult.Fail(msg));
        }

        if (!int.TryParse(gameIdStr, out var gameId))
        {
            return FailAndReset("Invalid game id");
        }

        if (!UserToken.TryParse(sessionTokenStr, out var token))
        {
            return FailAndReset("Invalid session token");
        }

        GameSession? session = _state.FindSession(gameId);
        if (session is null)
        {
            return FailAndReset("Game not found");
        }

        if (session.PhaseName == GamePhaseName.Terminated)
        {
            Response.Headers.Append("CL-Game-Terminated", "true");
            return FailAndReset("Game has been terminated.");
        }
        
        Player? player = session.PlayersByToken.GetValueOrDefault(token);

        if (player != null || session.HostToken == token)
        {
            return Task.FromResult(AuthenticateResult.Success(new AuthenticationTicket(
                new GameUserPrincipal(session, player), "Game"
            )));
        }
        else
        {
            return FailAndReset("Player not in the game");
        }
    }

    protected override Task HandleChallengeAsync(AuthenticationProperties properties)
    {
        // This is quite the dirty hack...
        if (!Context.Request.Path.StartsWithSegments("/api"))
        {
            Response.Redirect("/Index");
        }
        else
        {
            Response.StatusCode = 401;
        }

        return Task.CompletedTask;
    }

    public Task SignOutAsync(AuthenticationProperties? properties)
    {
        Response.Cookies.Delete(Options.GameIdCookieName);
        Response.Cookies.Delete(Options.UserTokenCookieName);
        
        return Task.CompletedTask;
    }

    public Task SignInAsync(ClaimsPrincipal user, AuthenticationProperties? properties)
    {
        if (user is not GameUserPrincipal gameUser)
        {
            throw new InvalidOperationException("User should be a GameUserPrincipal");
        }

        int gameId = gameUser.GameId;
        GameSession session = gameUser.GameSession;
        UserToken token = gameUser.PlayerId == null
            ? session.HostToken
            : session.Players[gameUser.PlayerId.Value].LoginToken;

        CookieOptions options = new() { SameSite = SameSiteMode.Strict, MaxAge = TimeSpan.FromHours(8) };
        Response.Cookies.Append(Options.GameIdCookieName, gameId.ToString(), options);
        Response.Cookies.Append(Options.UserTokenCookieName, token.ToString(), options);
        
        return Task.CompletedTask;
    }
}