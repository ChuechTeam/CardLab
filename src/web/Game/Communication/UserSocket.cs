using System.Threading.Channels;

namespace CardLab.Game.Communication;

// An extremely basic socket for communicating messages with the client.
// Messages are delivered through WebSockets, so they are fairly reliable (cause it's TCP), 
// but it does NOT have any "great" error handling: which means that once the communication
// drops or a message fails to be delivered or received, the client needs to reconnect and
// gather the state again from scratch.
public sealed class UserSocket
{
    private static readonly UnboundedChannelOptions ChannelOptions = new()
    {
        SingleReader = true
    };

    public readonly record struct Connection(Channel<LabMessage> SendChannel, int Id, CancellationToken StopToken);
    
    public Channel<LabMessage> SendChannel { get; set; }
        = Channel.CreateUnbounded<LabMessage>(ChannelOptions);
    
    // Lock for connection/disconnection related stuff, very low contention anyway
    public object Lock { get; } = new();

    public int ConnectionId { get; set; } = 0;
    public bool Connected { get; set; } = true;
    public bool Closed { get; set; } = false;
    public DateTime? LastDisconnect { get; set; } = null; // UTC time

    // Used to notify that we're ending an ongoing connection, to end the websocket.
    public CancellationTokenSource CancelToken { get; set; } = new();
    
    public Action<LabMessage>? ReceiveHandler { get; set; } = null;
    public Action? OnDisconnect { get; set; } = null;

    // Null if connection closed
    public Connection? StartConnection()
    {
        lock (Lock)
        {
            if (Closed)
            {
                return null;
            }
            
            // Stop the previous connection
            if (Connected)
            {
                StopConnection(ConnectionId);
            }
            
            Connected = true;
            ConnectionId++;
            LastDisconnect = null;
            
            var token = CancelToken.Token;

            return new Connection(SendChannel, ConnectionId, token);
        }
    }

    public void Close()
    {
        lock (Lock)
        {
            if (Closed)
            {
                return;
            }
            
            StopConnection(ConnectionId);
            Closed = true;
        }
    }

    public void StopConnection(int id)
    {
        lock (Lock)
        {
            if (!Connected || ConnectionId != id)
            {
                return;
            }
            
            Connected = false;
            LastDisconnect = DateTime.UtcNow;
            
            CancelToken.Cancel();
            CancelToken = new CancellationTokenSource();
            
            // Discard all messages and notify that the connection is closed using the channel and the token.
            SendChannel.Writer.Complete();
            SendChannel = Channel.CreateUnbounded<LabMessage>(ChannelOptions);
            
            OnDisconnect?.Invoke();
        }
    }
    
    // Messages are not sent until the user connects!
    public void SendMessage(LabMessage message)
    {
        // There's no need to lock here because, in the worst case scenario,
        // there's a delay in a magnitude of nanoseconds.
        if (Connected)
        {
            // Async is unnecessary here because we're discarding old messages.
            SendChannel.Writer.TryWrite(message);
        }
    }
}