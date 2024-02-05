using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace CardLab.Pages.Game;

public class MakeCards : GamePageModel
{
    public Card[] Cards { get; set; } = [];
    
    public void OnGet()
    {
        using (Session.CreateReadTransaction())
        {
            if (Session.Phase != GamePhase.CreatingCards || Player is null)
            {
                Response.Redirect("/Game/Index");
                return;
            }

            // Clone the cards
            Cards = Player.Cards.Select(x => x with { }).ToArray();
        }
    }
}