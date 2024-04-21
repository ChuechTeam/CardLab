namespace CardLab.Game.AssetPacking;

public class GamePackCompileWorker(
    GamePackCompileQueue queue, 
    GamePackCompiler compiler, 
    ILogger<GamePackCompileWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            var (req, src) = await queue.Channel.Reader.ReadAsync(stoppingToken);
            try
            {
                logger.LogInformation("Picking up queued pack work {Id}", req.PackId);
                var pack = await compiler.CompileAsync(req, stoppingToken);
                src.SetResult(pack);
            }
            catch (OperationCanceledException)
            {
                logger.LogInformation("Compilation of pack {Id} was canceled", req.PackId);
                src.SetCanceled(stoppingToken);
            }
            catch (Exception e)
            {
                logger.LogError(e, "Failed to compile pack {Id}", req.PackId);
                src.SetException(e);
            }
        }
    }
    
    public override async Task StopAsync(CancellationToken cancellationToken)
    {
        queue.Channel.Writer.Complete();
        await base.StopAsync(cancellationToken);
    }
}