using System.Threading.Channels;

namespace CardLab.Game.Communication;

// An extremely basic socket for communicating messages with the client.
// Messages are delivered through WebSockets, so they are fairly reliable (cause it's TCP), 
// but it does NOT have any "great" error handling: which means that once the communication
// drops or a message fails to be delivered or received, the client needs to reconnect and
// gather the state again from scratch.
public sealed class UserSocket
{
    private static readonly BoundedChannelOptions ChannelOptions = new(256)
    {
        FullMode = BoundedChannelFullMode.DropOldest
    };

    public readonly record struct Connection(Channel<LabMessage> SendChannel, int Id, CancellationToken StopToken);
    
    // Soon, there will a receive channel for duels.
    
    public Channel<LabMessage> SendChannel { get; set; }
        = Channel.CreateBounded<LabMessage>(ChannelOptions);
    
    // Lock for connection/disconnection related stuff, very low contention anyway
    public object Lock { get; } = new();

    public int ConnectionId { get; set; } = 0;
    public bool Connected { get; set; } = true;

    // Used to notify that we're ending an ongoing connection, to end the websocket.
    public CancellationTokenSource CancelToken { get; set; } = new();
    
    public Action<LabMessage>? ReceiveHandler { get; set; } = null;

    public Connection StartConnection()
    {
        lock (Lock)
        {
            // Stop the previous connection
            if (Connected)
            {
                StopConnection(ConnectionId);
            }
            
            Connected = true;
            ConnectionId++;
            
            var token = CancelToken.Token;

            return new Connection(SendChannel, ConnectionId, token);
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
            
            CancelToken.Cancel();
            CancelToken = new CancellationTokenSource();
            
            // Discard all messages and notify that the connection is closed using the channel and the token.
            SendChannel.Writer.Complete();
            SendChannel = Channel.CreateBounded<LabMessage>(ChannelOptions);
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