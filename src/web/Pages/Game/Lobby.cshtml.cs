using System.Collections.Immutable;
using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace CardLab.Pages.Game;

public class Lobby : GamePageModel
{
    public GamePhase Phase { get; set; }

    public string Code { get; set; } = "";

    public ImmutableArray<string> Players { get; set; } = ImmutableArray<string>.Empty;

    [FromQuery(Name = "fragment")] public bool Fragment { get; set; } = false;

    public IActionResult OnGet()
    {
        if (Fragment)
        {
            ViewData["NoLayout"] = true;
        }

        using (Session.CreateReadTransaction())
        {
            Phase = Session.Phase;
            if (Phase != GamePhase.WaitingForPlayers)
            {
                return RedirectToPage("/Game/Index");
            }

            Code = Session.Code;
            Players = Session.Players.Values.Select(p => p.Name).ToImmutableArray();
        }

        return Page();
    }

    public IActionResult OnPostStart()
    {
        if (!IsTheHost)
        {
            return RedirectToPage("/Game/Index");
        }

        using (Session.CreateReadWriteTransaction())
        {
            if (Session.Phase != GamePhase.WaitingForPlayers)
            {
                return RedirectToPage("/Game/Index");
            }

            Session.StartGame();
        }

        return RedirectToPage("/Game/Index");
    }

    public IActionResult OnPostTerminate()
    {
        if (IsTheHost)
        {
            using (Session.CreateReadWriteTransaction())
            {
                Session.TerminateGame();
            }
        }

        return RedirectToPage("/Game/Index");
    }

    public IActionResult OnPostQuit()
    {
        if (Player != null)
        {
            using (Session.CreateReadWriteTransaction())
            {
                Session.PlayerQuit(Player.Id);
            }
        }

        return RedirectToPage("/Game/Index");
    }
}