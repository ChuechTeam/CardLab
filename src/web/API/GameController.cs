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

namespace CardLab.API;

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
    public const WebSocketCloseStatus KickedCode = (WebSocketCloseStatus)3003;


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

        // First check if the socket is closed to avoid opening a websocket for nothing.
        if (userSocket.Closed)
        {
            HttpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
        
        using var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();
        
        var conn = userSocket.StartConnection();
        if (conn is null)
        {
            HttpContext.Response.StatusCode = StatusCodes.Status401Unauthorized;
            return;
        }
        var (send, id, connectionReplacedToken) = conn.Value;
        
        // We have to do this very ugly stuff so we don't get locks locking for nothing when processing the duel msg.
        int wId;
        Guid wPermId;
        PlayerPayload? wPlayer;
        DownloadablePackPayload? wPack;
        GamePhaseName wPhaseName;
        PhaseStatePayload? wPhaseState;
        bool wRequiresPack;
        (Duel, PlayerIndex)? duelInfo;
        lock (session.Lock)
        {
            wId = session.Id;
            wPermId = session.PermanentId;
            wPlayer = player is not null ? new PlayerPayload(player.Id, player.Name) : null;
            wPack = session.Pack is { } p ? new DownloadablePackPayload(p.DefUrlFilePath, p.ResUrlFilePath) : null;
            wRequiresPack = session.DuelState?.RequiresSessionPack ?? false;
            wPhaseName = session.PhaseName;
            wPhaseState = session.Phase.GetStateForUser(player);
            duelInfo = player is null ? null : session.DuelState?.PlayerToDuel.GetValueOrDefault(player.Id);
        }

        DuelWelcomeMessage? wDuel = null;
        if (duelInfo is var (duel, idx))
        {
            wDuel = duel.MakeWelcomeMessage(idx);
        }

        // Send the welcome message now
        // Any message sent before this one should be queued by the client.
        send.Writer.TryWrite(
            new WelcomeMessage(wId, wPermId, wPlayer, wPack, wDuel, wRequiresPack, wPhaseName, wPhaseState)
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

                    // Handle incoming messages only for duels.
                    try
                    {
                        var mess = JsonSerializer.Deserialize<LabMessage>(
                            new ArraySegment<byte>(readBuffer, 0, res.Count), 
                            jsonOpt.Value.SerializerOptions);
                        if (mess is not null 
                            && player is not null
                            && session.DuelState is {} ds
                            && ds.PlayerToDuel.TryGetValue(player.Id, out var duelRecipient))
                        {
                            duelRecipient.duel.Routing.ReceiveMessage(duelRecipient.idx, mess);
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
            if (player?.Kicked ?? false)
            {
                closeStatus = KickedCode;
                closeDesc = "You have been kicked from the game.";
            }
            else if (connectionReplacedToken.IsCancellationRequested || e.InnerException is ChannelClosedException)
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
            
            // Notify the duel that the use has disconnected.
            if (player is not null
                && session.DuelState is {} ds
                && ds.PlayerToDuel.TryGetValue(player.Id, out var duelRecipient))
            {
                duelRecipient.duel.OnPlayerDisconnection(duelRecipient.idx);
            }

            if (webSocket.State is not WebSocketState.Closed and not WebSocketState.Aborted)
            {
                await webSocket.CloseAsync(closeStatus, closeDesc, CancellationToken.None);
            }
        }
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

    public record GameStateApiModel(GamePhaseName Name, PhaseStatePayload? State);

    public record HelloApiModel(GameStateApiModel Phase, PlayerPayload? Me);
}