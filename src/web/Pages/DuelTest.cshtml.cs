using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace CardLab.Pages;

public class DuelTest : PageModel
{
    public void OnGet([FromRoute] int playerIndex)
    {
        ViewData["PlayerIndex"] = playerIndex;
    }
}