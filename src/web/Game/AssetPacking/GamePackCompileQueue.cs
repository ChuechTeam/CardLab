using System.Threading.Channels;

namespace CardLab.Game.AssetPacking;

public sealed class GamePackCompileQueue
{
    public Channel<Work> Channel { get; } = System.Threading.Channels.Channel.CreateUnbounded<Work>(new UnboundedChannelOptions
    {
        SingleReader = true
    });

    public readonly record struct Work(GamePackCompileRequest Request, TaskCompletionSource<GamePack> TaskCompletion);
    
    public Task<GamePack> EnqueueAsync(GamePackCompileRequest request, CancellationToken token = default)
    {
        var src = new TaskCompletionSource<GamePack>();
        Channel.Writer.TryWrite(new Work(request, src));
        return src.Task;
    }
}