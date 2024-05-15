using System.Net;
using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace CardLab.API
{
    [Route("api/game/[controller]")]
    [ApiController]
    [Authorize(Policy = "Host")]
    public class HostController : ControllerBase
    {
        [HttpPost("start-game")]
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

        [HttpPost("end-card-creation")]
        public IActionResult EndCardCreation()
        {
            var user = (GameUserPrincipal)User;

            var result = user.GameSession.SwitchToPreparationPhase();
            if (result.FailedWith(out var error))
            {
                return Problem(error, statusCode: (int)HttpStatusCode.Conflict);
            }
            else
            {
                return Ok();
            }
        }
        
        [HttpPost("start-tutorial-duels")]
        public IActionResult StartTutorialDuels()
        {
            var user = (GameUserPrincipal)User;

            var result = user.GameSession.StartTutorialDuels();
            if (result.FailedWith(out var error))
            {
                return Problem(error, statusCode: (int)HttpStatusCode.Conflict);
            }
            else
            {
                return Ok();
            }
        }
        
        [HttpPost("end-tutorial")]
        public IActionResult EndTutorial()
        {
            var user = (GameUserPrincipal)User;

            var result = user.GameSession.SwitchToCardCreationPhase();
            if (result.FailedWith(out var error))
            {
                return Problem(error, statusCode: (int)HttpStatusCode.Conflict);
            }
            else
            {
                return Ok();
            }
        }

        [HttpPost("kick-player")]
        public IActionResult KickPlayer([FromQuery] int id)
        {
            var user = (GameUserPrincipal)User;

            var result = user.GameSession.KickPlayer(id);
            if (result.FailedWith(out var error))
            {
                return Problem(error, statusCode: (int)HttpStatusCode.Conflict);
            }
            else
            {
                return Ok();
            }
        }
        
        [HttpPost("preparation-reveal-opponents")]
        public IActionResult PreparationRevealOpponents()
        {
            var user = (GameUserPrincipal)User;

            var result = user.GameSession.PreparationRevealOpponents();
            if (result.FailedWith(out var error))
            {
                return Problem(error, statusCode: (int)HttpStatusCode.Conflict);
            }
            else
            {
                return Ok();
            }
        }
        
        [HttpPost("end-preparation")]
        public IActionResult EndPreparation()
        {
            var user = (GameUserPrincipal)User;

            var result = user.GameSession.EndPreparation();
            if (result.FailedWith(out var error))
            {
                return Problem(error, statusCode: (int)HttpStatusCode.Conflict);
            }
            else
            {
                return Ok();
            }
        }
        
        [HttpPost("duels-start-round")]
        public IActionResult DuelsStartRound()
        {
            var user = (GameUserPrincipal)User;

            var result = user.GameSession.DuelsStartRound();
            if (result.FailedWith(out var error))
            {
                return Problem(error, statusCode: (int)HttpStatusCode.Conflict);
            }
            else
            {
                return Ok();
            }
        }
        
        [HttpPost("duels-end-round")]
        public IActionResult DuelsEndRound()
        {
            var user = (GameUserPrincipal)User;

            var result = user.GameSession.DuelsEndRound();
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
