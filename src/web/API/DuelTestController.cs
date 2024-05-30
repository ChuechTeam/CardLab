#if DEBUG
using System.Diagnostics.CodeAnalysis;
using System.Net.WebSockets;
using System.Text.Json;
using System.Threading.Channels;
using CardLab.Auth;
using CardLab.Game.Communication;
using CardLab.Game.Duels;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using JsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;

namespace CardLab.API
{
    /// <summary>
    /// Controller for testing duel functionalities and WebSocket connections.
    /// </summary>
    [Route("api/duel-test/")]
    [ApiController]
    public class DuelTestController(
        GlobalDuelTest globalDuelTest,
        IOptions<JsonOptions> jsonOpt,
        ILogger<GameController> logger,
        IHostApplicationLifetime lifetime) : ControllerBase
    {
        // Very ugly copy-paste of GameController websocket stuff
        public const WebSocketCloseStatus ConnectionReplacedCode = (WebSocketCloseStatus)3001;
        public const WebSocketCloseStatus ServerShuttingDownCode = (WebSocketCloseStatus)3002;

        /// <summary>
        /// Accepts WebSocket connections for a specific player in the duel test.
        /// </summary>
        /// <param name="playerIndex">The index of the player (0 or 1).</param>
        [Route("p{playerIndex:int}/ws")]
        [SuppressMessage("ReSharper.DPA", "DPA0011: High execution time of MVC action")]
        public async Task AcceptWebSocketAsync(int playerIndex)
        {
            if (!HttpContext.WebSockets.IsWebSocketRequest || (playerIndex != 0 && playerIndex != 1))
            {
                HttpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }

            static async Task SendMessageInQueue(Channel<LabMessage> channel, WebSocket wSocket, JsonSerializerOptions serializerOptions, CancellationToken token)
            {
                var message = await channel.Reader.ReadAsync(token);
                var buffer = JsonSerializer.SerializeToUtf8Bytes(message, serializerOptions);

                await wSocket.SendAsync(buffer, WebSocketMessageType.Text, true, token);
            }

            var duel = globalDuelTest.TheDuel;
            var userSocket = playerIndex == 0 ? duel.P1Socket : duel.P2Socket;
            using var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();

            var conn = userSocket.StartConnection();
            if (conn is null)
            {
                HttpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }
            var (send, id, connectionReplacedToken) = conn.Value;

            // Send the welcome message now
            send.Writer.TryWrite(duel.MakeWelcomeMessage((PlayerIndex)playerIndex));

            // Create a token that activates when either of these two tokens are cancelled:
            // - Application shutdown
            // - The user socket is replaced by another connection.
            using var ultimateTokenSrc = CancellationTokenSource.CreateLinkedTokenSource(connectionReplacedToken, lifetime.ApplicationStopping);
            var token = ultimateTokenSrc.Token;

            var closeStatus = WebSocketCloseStatus.InternalServerError;
            var closeDesc = "Something very wrong happened, and nobody in this room knows why...";
            try
            {
                var readBuffer = new byte[1024 * 8];

                var receiveTask = webSocket.ReceiveAsync(new ArraySegment<byte>(readBuffer), token);
                var sendTask = SendMessageInQueue(send, webSocket, jsonOpt.Value.SerializerOptions, default);

                while (true)
                {
                    var task = await Task.WhenAny(receiveTask, sendTask);

                    // Throw if the task failed.
                    if (task.Exception is not null)
                    {
                        throw task.Exception;
                    }

                    if (task == receiveTask)
                    {
                        // Stop the loop if we get a cancellation request from the client.
                        var res = receiveTask.Result;
                        if (res.CloseStatus != null)
                        {
                            if (res.CloseStatus is { } stat)
                            {
                                closeStatus = stat;
                            }

                            if (res.CloseStatusDescription is { } desc)
                            {
                                closeDesc = res.CloseStatusDescription;
                            }

                            break;
                        }

                        // TODO: Do something with the message one day?? maybe??
                        try
                        {
                            var mess = JsonSerializer.Deserialize<LabMessage>(new ArraySegment<byte>(readBuffer, 0, res.Count), jsonOpt.Value.SerializerOptions);
                            if (mess is not null)
                            {
                                userSocket.ReceiveHandler?.Invoke(mess);
                            }
                        }
                        catch (Exception e)
                        {
                            logger.LogWarning("Json deserialization failed in WebSocket message: {Error}", e);
                        }

                        receiveTask = webSocket.ReceiveAsync(new ArraySegment<byte>(readBuffer), token);
                    }
                    else if (task == sendTask)
                    {
                        sendTask = SendMessageInQueue(send, webSocket, jsonOpt.Value.SerializerOptions, token);
                    }
                }

                logger.LogInformation("Close status received from WebSocket, closing pipeline");
            }
            catch (AggregateException e) when (e.InnerException is OperationCanceledException or ChannelClosedException)
            {
                if (connectionReplacedToken.IsCancellationRequested || e.InnerException is ChannelClosedException)
                {
                    logger.LogInformation("WebSocket connection cancelled by UserSocket cancellation");
                    closeStatus = ConnectionReplacedCode;
                    closeDesc = "Another device has been connected to the game.";
                }
                else
                {
                    logger.LogInformation("WebSocket connection cancelled by application shutdown");
                    closeStatus = ServerShuttingDownCode;
                    closeDesc = "The server is shutting down.";
                }
            }
            catch (Exception e)
            {
                logger.LogWarning("Exception happened during main WebSocket loop: {Ex}", e);
            }
            finally
            {
                userSocket.StopConnection(id);

                if (webSocket.State is not WebSocketState.Closed and not WebSocketState.Aborted)
                {
                    await webSocket.CloseAsync(closeStatus, closeDesc, CancellationToken.None);
                }
            }
        }

        /// <summary>
        /// Gets the current state of the duel.
        /// </summary>
        /// <returns>An object containing the current duel state.</returns>
        [HttpGet("state")]
        public IActionResult GetDuelState()
        {
            var duel = globalDuelTest.TheDuel;
            return Ok(new
            {
                duel.State,
                duel.State.Status,
                duel.StateIteration
            });
        }

        /// <summary>
        /// Starts the duel.
        /// </summary>
        /// <returns>HTTP 200 OK if the duel starts successfully; otherwise, HTTP 400 Bad Request.</returns>
        [HttpPost("start")]
        public IActionResult StartPlaying()
        {
            var duel = globalDuelTest.TheDuel;
            if (duel.State.Status != DuelStatus.AwaitingConnection)
            {
                return BadRequest();
            }

            duel.SwitchToPlaying();
            return Ok();
        }

        /// <summary>
        /// Resets the duel.
        /// </summary>
        /// <returns>HTTP 200 OK if the duel is reset successfully.</returns>
        [HttpPost("reset")]
        public IActionResult Reset()
        {
            globalDuelTest.Reset();
            return Ok();
        }

        public record UseUnitAttackInput(int UnitId, int TargetId);

        /// <summary>
        /// Handles unit attack actions in the duel.
        /// </summary>
        /// <param name="playerIndex">The index of the player (0 or 1).</param>
        /// <param name="message">The attack message containing unit and target IDs.</param>
        /// <returns>HTTP 200 OK if the action is successful; otherwise, HTTP 400 Bad Request or HTTP 409 Conflict.</returns>
        [HttpPost("p{playerIndex:int}/use-unit-attack")]
        public IActionResult UseUnitAttack(int playerIndex, [FromBody] UseUnitAttackInput message)
        {
            var duel = globalDuelTest.TheDuel;
            if (duel.State.Status != DuelStatus.Playing)
            {
                return BadRequest();
            }

            var res = duel.UseUnitAttack((PlayerIndex)playerIndex, message.UnitId, message.TargetId);
            return res.FailedWith(out var m) ? Conflict(m) : Ok();
        }

        /// <summary>
        /// Ends the turn for the specified player.
        /// </summary>
        /// <param name="playerIndex">The index of the player (0 or 1).</param>
        /// <returns>HTTP 200 OK if the turn ends successfully; otherwise, HTTP 400 Bad Request or HTTP 409 Conflict.</returns>
        [HttpPost("p{playerIndex:int}/end-turn")]
        public IActionResult EndTurn(int playerIndex)
        {
            var duel = globalDuelTest.TheDuel;
            if (duel.State.Status != DuelStatus.Playing)
            {
                return BadRequest();
            }

            var res = duel.EndTurn((PlayerIndex)playerIndex);
            return res.FailedWith(out var m) ? Conflict(m) : Ok();
        }
    }
}
#endif
