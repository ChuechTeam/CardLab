using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace CardLab.Pages;

[AllowAnonymous]
[IgnoreAntiforgeryToken(Order = 10001)]
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
    
    public async Task<IActionResult> OnPostJoinAsync()
    {
        if (User.Identity?.IsAuthenticated == true)
        {
            return RedirectToPage("/Game/Index");
        }

        if (string.IsNullOrWhiteSpace(JoinCode))
        {
            JoinErrMsg = "Code invalide.";
            return Page();
        }
        
        var session = _state.FindSession(JoinCode);
        if (session is null)
        {
            JoinErrMsg = "Code invalide.";
            return Page();
        }

        if (session.PhaseName != GamePhaseName.WaitingForPlayers)
        {
            JoinErrMsg = "La partie a déjà commencé.";
            return Page();
        }

        var result = session.AddPlayer(PlayerName);

        if (result.SucceededWith(out var player))
        {
            await HttpContext.SignInAsync("Game", new GameUserPrincipal(session, player));
            return RedirectToPage("/Game/Index");
        }
        else
        {
            JoinErrMsg = result.Error ?? "";
            return Page();
        }
    }

    public IActionResult OnPostQuit()
    {
        if (User is GameUserPrincipal gameUser)
        {
            if (gameUser.PlayerId != null)
            {
                // Purposefully ignore any error.
                gameUser.GameSession.PlayerQuit(gameUser.PlayerId.Value);
            }
            else
            {
                gameUser.GameSession.TerminateGame();
            }

            HttpContext.SignOutAsync("Game");
        }

        return RedirectToPage("/Index");
    }
}