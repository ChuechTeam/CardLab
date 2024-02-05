using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Mvc.Filters;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace CardLab.Pages.Game;

public abstract class GamePageModel : PageModel
{
    public new GameUserPrincipal User { get; private set; } = null!;
    
    public Player? Player { get; private set; } = null!;
    public bool IsTheHost => Player == null;

    public GameSession Session { get; private set; } = null!;
    
    public override void OnPageHandlerExecuting(PageHandlerExecutingContext context)
    {
        User = (GameUserPrincipal)HttpContext.User;
        Session = User.GameSession;
        Player = User.PlayerId is {} v ? Session.Players.GetValueOrDefault(v) : null;
        
        base.OnPageHandlerExecuting(context);
    }
}