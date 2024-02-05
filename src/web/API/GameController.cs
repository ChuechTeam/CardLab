using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace CardLab.API
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class GameController : ControllerBase
    {
        public record CardInput(string Name, string Description, int Attack, int Health);
            
        [HttpPost("cards")]
        public IActionResult PostCards(IEnumerable<CardInput> cards)
        {
            return Ok(cards);
        }
    }
}
