using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.RazorPages;

namespace CardLab.Pages;

public class DuelTest(IWebHostEnvironment hostEnv) : PageModel
{
    public IActionResult OnGet([FromRoute] int playerIndex)
    {
        if (!hostEnv.IsDevelopment() && !hostEnv.IsStaging())
        {
            return NotFound();
        }
        ViewData["PlayerIndex"] = playerIndex;
        return Page();
    }
}