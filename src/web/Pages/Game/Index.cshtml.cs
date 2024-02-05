using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace CardLab.Pages.Game;

// Pretty much the "hub" of the game, which controls where people get redirected to.
public class Index : GamePageModel
{
    public IActionResult OnGet()
    {
        using (Session.CreateReadTransaction())
        {
            return (Session.Phase, IsTheHost) switch
            {
                (GamePhase.WaitingForPlayers, _) => RedirectToPage("/Game/Lobby"),
                (GamePhase.CreatingCards, false) => RedirectToPage("/Game/MakeCards"),
                _ => Content("Y'a pas de page lol")
            };
        }
    }
}