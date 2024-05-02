using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace CardLab.Pages;

public class CreateGame(ServerState state) : PageModel
{
    public async Task<IActionResult> OnGet()
    {
        GameSession session = state.CreateSession();

        await HttpContext.SignInAsync("Game", new GameUserPrincipal(session, null));

        return RedirectToPage("/Game/Index");
    }
}