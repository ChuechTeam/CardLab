using System.Collections.Immutable;
using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace CardLab.Pages.Game;

public class Lobby : GamePageModel
{
    public GamePhaseName Phase { get; set; }

    public string Code { get; set; } = "";

    public ImmutableArray<string> Players { get; set; } = ImmutableArray<string>.Empty;

    [FromQuery(Name = "fragment")] public bool Fragment { get; set; } = false;

    public IActionResult OnGet()
    {
        if (Fragment)
        {
            ViewData["NoLayout"] = true;
        }

        Phase = Session.PhaseName;
        if (Phase != GamePhaseName.WaitingForPlayers)
        {
            return RedirectToPage("/Game/Index");
        }

        Code = Session.Code;
        Players = Session.Players.Values.Select(p => p.Name).ToImmutableArray();

        return Page();
    }

    public IActionResult OnPostStart()
    {
        if (IsTheHost)
        {
            var result = Session.StartGame(); // May fail!
            if (result.FailedWith(out var errMsg))
            {
                // TODO: Show error message
            }
        }

        return RedirectToPage("/Game/Index");
    }

    public IActionResult OnPostTerminate()
    {
        if (IsTheHost)
        {
            Session.TerminateGame();
        }

        return RedirectToPage("/Game/Index");
    }

    public IActionResult OnPostQuit()
    {
        if (Player != null)
        {
            // Ignore any errors.
            Session.PlayerQuit(Player.Id);
        }

        return RedirectToPage("/Game/Index");
    }
}