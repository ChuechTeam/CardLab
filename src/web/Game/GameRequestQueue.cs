using System.Collections.Immutable;
using System.Runtime.InteropServices;
using System.Threading.Channels;
using CardLab.Game.AssetPacking;
using Microsoft.Extensions.Options;

namespace CardLab.Game;

// This file contains draft work that isn't yet used by the game.

public sealed class GameRequestQueue
{
    public int NumSubQueues { get; }

    public ImmutableArray<Channel<Work>> SubQueues { get; }

    public GameRequestQueue(IOptions<Options> options)
    {
        NumSubQueues = Math.Max(1, options.Value.Tasks ??
                                   (int)(Environment.ProcessorCount * options.Value.ProcessorCountPercent));

        var queues = new Channel<Work>[NumSubQueues];
        for (int i = 0; i < NumSubQueues; i++)
        {
            queues[i] = Channel.CreateUnbounded<Work>(new UnboundedChannelOptions
            {
                SingleReader = true,
                // Most continuations are very fast functions to execute.
                AllowSynchronousContinuations = true
            });
        }

        SubQueues = ImmutableCollectionsMarshal.AsImmutableArray(queues);
    }

    public async Task<TResp> EnqueueAsync<TResp>(GameSession session, GameRequest<TResp> request)
    {
        var src = new TaskCompletionSource();
        SubQueues[session.Id % NumSubQueues].Writer.TryWrite(new Work(session, request, src));
        await src.Task;
        return request.Response!;
    }

    public sealed class Options
    {
        public const string Section = "GameRequestQueue";

        // Used to override ProcessorCountPercent
        public int? Tasks { get; set; } = null;
        public float ProcessorCountPercent { get; set; } = 1;
    }

    public readonly record struct Work(GameSession Session, GameRequest Request, TaskCompletionSource Completion);
}

public sealed class GameRequestWorker(GameRequestQueue queue) : BackgroundService
{
    private readonly int _num = queue.NumSubQueues;
    private readonly Task[] _consumers = new Task[queue.NumSubQueues];
    private readonly ImmutableArray<Channel<GameRequestQueue.Work>> _queues = queue.SubQueues;

    protected override Task ExecuteAsync(CancellationToken stoppingToken)
    {
        for (int i = 0; i < _num; i++)
        {
            _consumers[i] = Task.Factory.StartNew(Process,
                (_queues[i], stoppingToken),
                stoppingToken,
                TaskCreationOptions.LongRunning,
                TaskScheduler.Current).Unwrap();
            continue;

            static async Task Process(object? q)
            {
                var (queue, tok) = ((Channel<GameRequestQueue.Work>, CancellationToken))q!;
                while (!tok.IsCancellationRequested)
                {
                    var work = await queue.Reader.ReadAsync(tok);
                    try
                    {
                        work.Session.ProcessRequest(work.Request);
                        work.Completion.SetResult();
                    }
                    catch (Exception e)
                    {
                        work.Completion.SetException(e);
                    }
                }
            }
        }

        return Task.WhenAll(_consumers);
    }

    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        foreach (var q in _queues)
        {
            q.Writer.Complete();
        }
        await base.StopAsync(cancellationToken);
    }
}

public abstract record GameRequest(byte Type);

public abstract record GameRequest<TResp>(byte Type) : GameRequest(Type)
{
    // It's a field so we can use "out" on it.
    internal TResp? Response = default;
}

public sealed record StartGameRequest() : GameRequest<Result<Unit>>(TypeId)
{
    public const byte TypeId = 0;
}