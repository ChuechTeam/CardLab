using System.Buffers;
using System.Collections.Immutable;
using System.Diagnostics.CodeAnalysis;
using System.Net.WebSockets;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.Channels;
using CardLab.Auth;
using CardLab.Game;
using CardLab.Game.Communication;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Localization.Routing;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using JsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;

namespace CardLab.API
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class GameController(
        IOptions<JsonOptions> jsonOpt,
        ILogger<GameController> logger,
        IHostApplicationLifetime lifetime) : ControllerBase
    {
        public const WebSocketCloseStatus ConnectionReplacedCode = (WebSocketCloseStatus)3001;
        public const WebSocketCloseStatus ServerShuttingDownCode = (WebSocketCloseStatus)3002;


        [Route("ws")]
        [SuppressMessage("ReSharper.DPA", "DPA0011: High execution time of MVC action")]
        public async Task AcceptWebSocketAsync()
        {
            if (!HttpContext.WebSockets.IsWebSocketRequest)
            {
                HttpContext.Response.StatusCode = StatusCodes.Status400BadRequest;
                return;
            }

            static async Task SendMessageInQueue(Channel<LabMessage> channel,
                WebSocket wSocket,
                JsonSerializerOptions serializerOptions,
                CancellationToken token)
            {
                var message = await channel.Reader.ReadAsync(token);
                var buffer = JsonSerializer.SerializeToUtf8Bytes(message, serializerOptions);

                await wSocket.SendAsync(buffer, WebSocketMessageType.Text, true, token);
            }

            var user = (GameUserPrincipal)User;
            var session = user.GameSession;
            var player = user.Player;

            var userSocket = player?.Socket ?? session.HostSocket;
            using var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();

            var (send, id, connectionReplacedToken) = userSocket.StartConnection();

            // Send the welcome message now
            // TODO: Fix (very rare) possible race condition issue when a message gets sent before the
            //       welcome message.
            send.Writer.TryWrite(
                new WelcomeMessage(
                    player is not null ? new PlayerPayload(player.Id, player.Name) : null,
                    session.PhaseName,
                    session.Phase.GetStateForUser(player))
            );

            // Create a token that activates when either of these two tokens are cancelled:
            // - Application shutdown
            // - The user socket is replaced by another connection.
            using var ultimateTokenSrc =
                CancellationTokenSource.CreateLinkedTokenSource(connectionReplacedToken, lifetime.ApplicationStopping);
            var token = ultimateTokenSrc.Token;

            var closeStatus = WebSocketCloseStatus.InternalServerError;
            var closeDesc = "Something very wrong happened, and nobody in this room knows why...";
            try
            {
                var readBuffer = new byte[1024 * 8];

                var receiveTask =
                    webSocket.ReceiveAsync(new ArraySegment<byte>(readBuffer), token);
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

        [HttpPost("ping-me")]
        public IActionResult PingMePls()
        {
            var user = (GameUserPrincipal)User;
            user.GameSession.HostSocket.SendMessage(new HelloWorldMessage("Hello!"));

            return Ok();
        }

        [HttpGet("hello")]
        public ActionResult<HelloApiModel> GetHello()
        {
            var user = (GameUserPrincipal)User;
            var session = user.GameSession;

            var me = user.Player is { } p ? new PlayerPayload(p.Id, p.Name) : null;

            return new HelloApiModel(
                new GameStateApiModel(session.PhaseName, session.Phase.GetStateForUser(user.Player)), me);
        }

        [HttpGet("state")]
        public ActionResult<GameStateApiModel> GetState()
        {
            var user = (GameUserPrincipal)User;
            var session = user.GameSession;

            return new GameStateApiModel(session.PhaseName, session.Phase.GetStateForUser(user.Player));
        }

        // [HttpPost("cards/{index:int}")]
        // public IActionResult PostCard(int index, CardInput input)
        // {
        //     
        // }
    }
}

public record GameStateApiModel(GamePhaseName Name, PhaseStatePayload? State);

public record HelloApiModel(GameStateApiModel Phase, PlayerPayload? Me);