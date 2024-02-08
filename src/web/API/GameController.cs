using System.Buffers;
using System.Net.WebSockets;
using System.Text.Json;
using System.Threading.Channels;
using CardLab.Auth;
using CardLab.Game;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using JsonOptions = Microsoft.AspNetCore.Http.Json.JsonOptions;

namespace CardLab.API
{
    [Route("api/[controller]")]
    [ApiController]
    [Authorize]
    public class GameController(IOptions<JsonOptions> jsonOpt, ILogger<GameController> logger) : ControllerBase
    {
        [Route("ws")]
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
                var buffer = JsonSerializer.SerializeToUtf8Bytes(message, message.GetType(), serializerOptions);

                await wSocket.SendAsync(buffer, WebSocketMessageType.Text, true, token);
            }

            var user = (GameUserPrincipal)User;
            var session = user.GameSession;
            var player = user.Player;

            var userSocket = player?.Socket ?? session.HostSocket;
            using var webSocket = await HttpContext.WebSockets.AcceptWebSocketAsync();

            var (send, id, token) = userSocket.StartConnection();

            WebSocketReceiveResult? closingResult = null;
            try
            {
                var readBuffer = new byte[1024 * 8];
                
                // TODO: Handle timeouts with a ping/pong message.
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
                        if (receiveTask.Result.CloseStatus != null)
                        {
                            closingResult = receiveTask.Result;
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
                logger.LogInformation("WebSocket connection cancelled by UserSocket cancellation");
            }
            catch (Exception e)
            {
                logger.LogWarning("Exception happened during main WebSocket loop: {Ex}", e);
            }
            finally
            {
                userSocket.StopConnection(id);
                
                await webSocket.CloseAsync(
                    closingResult?.CloseStatus ?? WebSocketCloseStatus.InternalServerError,
                    closingResult?.CloseStatusDescription ?? "Something strange happened... Who knows?",
                    CancellationToken.None);
            }
        }

        public record CardInput(string Name, string Description, int Attack, int Health);

        // Limit the image size to 1 MB, which is larger than the maximum size of a
        // raw bitmap image of size 300x500 (600000 bytes).
        private const int MaxCardImageSize = 1024 * 1024; // 1 MB

        private string GetCardImagePath(GameSession session, int playerId, int cardIndex, out string dir)
        {
            // TODO: should be configurable and cleaned automatically when exceeding a total size.
            var rootDir = Path.Combine(Path.GetTempPath(), "CardLabAssets");
            var gameDir = Path.Combine(rootDir, session.PermanentId.ToString());
            dir = Path.Combine(gameDir, "Cards");
            var imgFile = Path.Combine(dir, $"{playerId}_{cardIndex}.png");
            return imgFile;
        }

        [HttpPost("cards/{index:int}/image")]
        public async Task<IActionResult> PostCardImage(IFormFile file, int index)
        {
            if (file.ContentType != "image/png")
            {
                return BadRequest("Only PNG images are supported.");
            }

            if (file.Length > MaxCardImageSize)
            {
                return BadRequest("File too large.");
            }

            var user = ((GameUserPrincipal)User);
            var session = user.GameSession;
            if (user.PlayerId is not { } playerId)
            {
                return BadRequest("The host can't upload files (why do you want to do that?)");
            }

            if (session.CardsPerPlayer <= index || index < 0)
            {
                return BadRequest("Invalid card index.");
            }

            // Is this check unnecessary? BeginCardUpload already does it...
            if (session.PhaseName != GamePhaseName.CreatingCards)
            {
                return BadRequest($"Wrong phase. (Phase=${session.PhaseName})");
            }

            var player = session.Players[playerId];
            var result = player.BeginCardUpload(index);

            if (result.FailedWith(out var msg))
            {
                return Problem(msg);
            }

            try
            {
                var path = GetCardImagePath(session, playerId, index, out string dir);
                Directory.CreateDirectory(dir);

                await using (var stream = System.IO.File.Create(path))
                {
                    await file.CopyToAsync(stream);
                }

                return Ok();
            }
            finally
            {
                player.EndCardUpload(index).ThrowIfFailed();
            }
        }

        [HttpPost("ping-me")]
        public IActionResult PingMePls()
        {
            var user = (GameUserPrincipal)User;
            user.GameSession.HostSocket.SendMessage(new HelloWorldMessage("Hello!"));

            return Ok();
        }

        // [HttpPost("cards/{index:int}")]
        // public IActionResult PostCard(int index, CardInput input)
        // {
        //     
        // }
    }
}