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
using CardLab.Game.Duels;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Localization.Routing;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using JsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;

namespace CardLab.API
{
    /// <summary>
    /// Controller to handle game-related actions and WebSocket connections.
    /// </summary>
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class GameController : ControllerBase
    {
        private readonly IOptions<JsonOptions> _jsonOpt;
        private readonly ILogger<GameController> _logger;
        private readonly IHostApplicationLifetime _lifetime;

        public const WebSocketCloseStatus ConnectionReplacedCode = (WebSocketCloseStatus)3001;
        public const WebSocketCloseStatus ServerShuttingDownCode = (WebSocketCloseStatus)3002;
        public const WebSocketCloseStatus KickedCode = (WebSocketCloseStatus)3003;

        public GameController(IOptions<JsonOptions> jsonOpt, ILogger<GameController> logger, IHostApplicationLifetime lifetime)
        {
            _jsonOpt = jsonOpt;
            _logger = logger;
            _lifetime = lifetime;
        }

        /// <summary>
        /// Accepts WebSocket connections and manages communication between the client and server.
        /// </summary>
        [Route("ws")]
        [SuppressMessage("ReSharper.DPA", "DPA0011: High execution time of MVC action")]
        public async Task AcceptWebSocketAsync()
        {
            if (!HttpContext.WebSockets.IsWebSocketRequest)
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

            var user = (GameUserPrincipal)User;
            var session = user.GameSession;
            var player = user.Player;

            var userSocket = player?.Socket ?? session.HostSocket;

            // First check if the socket is closed to avoid opening a websocket for nothing.
            if (userSocket.Closed)
            {
                HttpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }

            using var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();

            var connection = session.BeginUserConnection(player);
            if (connection is null)
            {
                HttpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
                return;
            }
            var (send, id, connectionReplacedToken) = connection.Value;

            // Create a token that activates when either of these two tokens are cancelled:
            // - Application shutdown
            // - The user socket is replaced by another connection.
            using var ultimateTokenSrc = CancellationTokenSource.CreateLinkedTokenSource(connectionReplacedToken, _lifetime.ApplicationStopping);
            var token = ultimateTokenSrc.Token;

            var closeStatus = WebSocketCloseStatus.InternalServerError;
            var closeDesc = "Something very wrong happened, and nobody in this room knows why...";
            try
            {
                var readBuffer = new byte[1024 * 8];

                // Only pass the token to the message sender so we can give our own error codes.
                var receiveTask = webSocket.ReceiveAsync(new ArraySegment<byte>(readBuffer), default);
                var sendTask = SendMessageInQueue(send, webSocket, _jsonOpt.Value.SerializerOptions, token);

                while (true)
                {
                    var task = await Task.WhenAny(receiveTask, sendTask);

                    // Throw if the task failed.
                    if (task.Exception is not null)
                    {
                        throw task.Exception;
                    }

                    // Then either:
                    // - the UserSocket CancellationToken has been cancelled, or
                    // - the application is stopping
                    if (task.IsCanceled)
                    {
                        TerminateCancelledSocket();
                        return;
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

                        // Handle incoming messages only for duels.
                        try
                        {
                            var mess = JsonSerializer.Deserialize<LabMessage>(new ArraySegment<byte>(readBuffer, 0, res.Count), _jsonOpt.Value.SerializerOptions);
                            if (mess is not null && player is not null && session.DuelState is { } ds && ds.PlayerToDuel.TryGetValue(player.Id, out var duelRecipient))
                            {
                                duelRecipient.duel.Routing.ReceiveMessage(duelRecipient.idx, mess);
                            }
                        }
                        catch (Exception e)
                        {
                            _logger.LogError("Failure while processing WebSocket message: {Error}", e);
                        }

                        receiveTask = webSocket.ReceiveAsync(new ArraySegment<byte>(readBuffer), default);
                    }
                    else if (task == sendTask)
                    {
                        sendTask = SendMessageInQueue(send, webSocket, _jsonOpt.Value.SerializerOptions, token);
                    }
                }

                _logger.LogInformation("Close status received from WebSocket, closing pipeline");
            }
            catch (AggregateException e) when (e.InnerException is WebSocketException ex)
            {
                if (ex.WebSocketErrorCode == WebSocketError.ConnectionClosedPrematurely)
                {
                    _logger.LogInformation("Websocket connection interrupted prematurely");
                }
                else
                {
                    _logger.LogWarning(ex, "Unexpected WebSocket exception happened (code={Code})", ex.WebSocketErrorCode.ToString());
                }
            }
            catch (AggregateException e) when (e.InnerException is OperationCanceledException or ChannelClosedException)
            {
                TerminateCancelledSocket();
            }
            catch (Exception e)
            {
                _logger.LogWarning(e, "Exception happened during main WebSocket loop");
            }
            finally
            {
                userSocket.StopConnection(id);

                // Notify the duel that the use has disconnected.
                if (player is not null && session.DuelState is { } ds && ds.PlayerToDuel.TryGetValue(player.Id, out var duelRecipient))
                {
                    duelRecipient.duel.OnPlayerDisconnection(duelRecipient.idx);
                }

                if (webSocket.State is not WebSocketState.Closed and not WebSocketState.Aborted)
                {
                    await webSocket.CloseAsync(closeStatus, closeDesc, CancellationToken.None);
                }
            }

            void TerminateCancelledSocket()
            {
                if (player?.Kicked ?? false)
                {
                    closeStatus = KickedCode;
                    closeDesc = "You have been kicked from the game.";
                }
                else if (connectionReplacedToken.IsCancellationRequested)
                {
                    _logger.LogInformation("WebSocket connection cancelled by UserSocket cancellation");
                    closeStatus = ConnectionReplacedCode;
                    closeDesc = "Another device has been connected to the game.";
                }
                else
                {
                    _logger.LogInformation("WebSocket connection cancelled by application shutdown");
                    closeStatus = ServerShuttingDownCode;
                    closeDesc = "The server is shutting down.";
                }
            }
        }

        /// <summary>
        /// Returns a hello message with the current game state and player information.
        /// </summary>
        /// <returns>An object containing the current game state and player information.</returns>
        [HttpGet("hello")]
        public ActionResult<HelloApiModel> GetHello()
        {
            var user = (GameUserPrincipal)User;
            var session = user.GameSession;

            var me = user.Player is { } p ? new PlayerPayload(p.Id, p.Name) : null;

            return new HelloApiModel(new GameStateApiModel(session.PhaseName, session.Phase.GetStateForUser(user.Player)), me);
        }

        /// <summary>
        /// Returns the current game state.
        /// </summary>
        /// <returns>An object containing the current game state.</returns>
        [HttpGet("state")]
        public ActionResult<GameStateApiModel> GetState()
        {
            var user = (GameUserPrincipal)User;
            var session = user.GameSession;

            return new GameStateApiModel(session.PhaseName, session.Phase.GetStateForUser(user.Player));
        }

        /// <summary>
        /// Represents the game state with the phase name and state payload.
        /// </summary>
        /// <param name="Name">The name of the game phase.</param>
        /// <param name="State">The state payload of the current phase.</param>
        public record GameStateApiModel(GamePhaseName Name, PhaseStatePayload? State);

        /// <summary>
        /// Represents a hello message containing the game state and player information.
        /// </summary>
        /// <param name="Phase">The current game phase and state.</param>
        /// <param name="Me">The player information.</param>
        public record HelloApiModel(GameStateApiModel Phase, PlayerPayload? Me);
    }
}
