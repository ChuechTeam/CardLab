namespace CardLab.Game.AssetPacking;

public readonly struct ResourceWriter(Stream file) : IDisposable, IAsyncDisposable
{
    public Stream File { get; } = file;
    
    private readonly Dictionary<string, ResourceRef> _resources = new(); 

    public async Task<ResourceRef> AddResourceAsync(string filePath)
    {
        if (_resources.TryGetValue(filePath, out var val))
        {
            return val;
        }
        
        await using var fStream = System.IO.File.OpenRead(filePath);
        
        var start = File.Position;
        await fStream.CopyToAsync(File);
        
        var end = File.Position;

        var resRef = new ResourceRef((uint)start, (uint)end - (uint)start);
        _resources.Add(filePath, resRef);
        return resRef;
    }

    public uint Size => (uint)File.Position;

    public void Dispose()
    {
        File.Dispose();
    }

    public async ValueTask DisposeAsync()
    {
        await File.DisposeAsync();
    }
}