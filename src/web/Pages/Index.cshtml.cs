using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace CardLab.Pages;

[AllowAnonymous]
public class IndexModel : PageModel
{
    private readonly ILogger<IndexModel> _logger;
    private readonly ServerState _state;

    public IndexModel(ILogger<IndexModel> logger, ServerState state)
    {
        _logger = logger;
        _state = state;
    }

    public bool IsInGame { get; set; } = false;

    [BindProperty] public string JoinCode { get; set; } = "";

    [BindProperty] public string PlayerName { get; set; } = "";

    public string JoinErrMsg { get; set; } = "";

    public void OnGet()
    {
        if (User.Identity?.IsAuthenticated == true)
        {
            IsInGame = true;
        }
    }

    public async Task<IActionResult> OnPostCreate()
    {
        GameSession session = _state.CreateSession();

        await HttpContext.SignInAsync("Game", new GameUserPrincipal(session, null));

        return RedirectToPage("/Game/Index");
    }

    public async Task<IActionResult> OnPostJoinAsync()
    {
        if (User.Identity?.IsAuthenticated == true)
        {
            return RedirectToPage("/Game/Index");
        }

        var session = _state.FindSession(JoinCode);
        if (session is null)
        {
            JoinErrMsg = "Code invalide.";
            return Page();
        }

        int playerId;
        using (session.CreateReadWriteTransaction())
        {
            if (session.Phase != GamePhase.WaitingForPlayers)
            {
                JoinErrMsg = "La partie a déjà commencé.";
                return Page();
            }

            var player = session.AddPlayer(PlayerName);
            playerId = player.Id;
        }
        
        await HttpContext.SignInAsync("Game", new GameUserPrincipal(session, playerId));
        return RedirectToPage("/Game/Lobby");
    }
    
    public IActionResult OnPostQuit()
    {
        if (User is GameUserPrincipal gameUser)
        {
            using (gameUser.GameSession.CreateReadWriteTransaction())
            {
                if (gameUser.PlayerId != null)
                {
                    gameUser.GameSession.PlayerQuit(gameUser.PlayerId.Value);
                }
                else
                {
                    gameUser.GameSession.TerminateGame();
                }
            }

            HttpContext.SignOutAsync("Game");
        }

        return RedirectToPage("/Index");
    }
}