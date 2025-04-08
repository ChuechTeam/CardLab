using System.Net;
using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;

namespace CardLab.API
{
    /// <summary>
    /// Controller to manage various phases and actions within a game session.
    /// </summary>
    [Route("api/game/[controller]")]
    [ApiController]
    [Authorize(Policy = "Host")]
    public class HostController : ControllerBase
    {
        [HttpPost("update-settings")]
        public IActionResult UpdateSettings([FromBody] UserGameSessionSettings settings)
        {
            if (!settings.Validate(out var errors))
            {
                var pb = ProblemDetailsFactory.CreateProblemDetails(
                    HttpContext, statusCode: 400, title: "Validation error");
                pb.Extensions.Add("extra", errors);
                return BadRequest(pb);
            }
            
            var user = (GameUserPrincipal)User;
            if (user.GameSession.UpdateSettings(settings).FailedWith(out var err))
            {
                return Problem(statusCode: 409, detail: err);
            }
            
            return Ok();
        }
        
        /// <summary>
        /// Starts the game session.
        /// </summary>
        /// <returns>HTTP 200 OK if the game starts successfully; otherwise, HTTP 409 Conflict with an error message.</returns>
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

        /// <summary>
        /// Ends the card creation phase and switches to the preparation phase.
        /// </summary>
        /// <returns>HTTP 200 OK if the phase switches successfully; otherwise, HTTP 409 Conflict with an error message.</returns>
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

        /// <summary>
        /// Starts the tutorial duels phase.
        /// </summary>
        /// <returns>HTTP 200 OK if the tutorial duels start successfully; otherwise, HTTP 409 Conflict with an error message.</returns>
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

        /// <summary>
        /// Ends the tutorial and switches to the card creation phase.
        /// </summary>
        /// <returns>HTTP 200 OK if the tutorial ends successfully; otherwise, HTTP 409 Conflict with an error message.</returns>
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

        /// <summary>
        /// Kicks a player from the game session.
        /// </summary>
        /// <param name="id">The ID of the player to kick.</param>
        /// <returns>HTTP 200 OK if the player is kicked successfully; otherwise, HTTP 409 Conflict with an error message.</returns>
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

        /// <summary>
        /// Reveals the opponents during the preparation phase.
        /// </summary>
        /// <returns>HTTP 200 OK if opponents are revealed successfully; otherwise, HTTP 409 Conflict with an error message.</returns>
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

        /// <summary>
        /// Ends the preparation phase.
        /// </summary>
        /// <returns>HTTP 200 OK if the preparation phase ends successfully; otherwise, HTTP 409 Conflict with an error message.</returns>
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

        /// <summary>
        /// Starts a new round of duels.
        /// </summary>
        /// <returns>HTTP 200 OK if the round starts successfully; otherwise, HTTP 409 Conflict with an error message.</returns>
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

        /// <summary>
        /// Ends the current round of duels.
        /// </summary>
        /// <returns>HTTP 200 OK if the round ends successfully; otherwise, HTTP 409 Conflict with an error message.</returns>
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
