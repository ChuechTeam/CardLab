using System.Net;
using CardLab.Auth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace CardLab.API
{
    [Route("api/game/[controller]")]
    [ApiController]
    [Authorize]
    public class LobbyController : ControllerBase
    {
        [HttpPost("start-game")]
        [Authorize(Policy = "Host")]
        public IActionResult StartGame()
        {
            var user = (GameUserPrincipal)User;

            var result = user.GameSession.StartGame();
            if (result.FailedWith(out var error))
            {
                return Problem(error, statusCode: (int)HttpStatusCode.Conflict);
            }
            else
            {
                return Ok();
            }
        }
    }
}
