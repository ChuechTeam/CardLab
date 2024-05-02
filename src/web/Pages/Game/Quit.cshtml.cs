using CardLab.Auth;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace CardLab.Pages.Game;

public class Quit : PageModel
{
    public IActionResult OnGet()
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