export class DuelMessaging {
    managedSocket: WebSocket | null = null
    onMessageReceived: (message: DuelMessage) => void = () => {}

    constructor(managedSocketUrl: string | URL | null) {
        if (managedSocketUrl) {
            this.managedSocket = new WebSocket(managedSocketUrl)
            this.managedSocket.addEventListener("message", 
                    m => this.receiveMessage(JSON.parse(m.data)));
        }
    }

    receiveMessage(message: LabMessage) {
        console.log("DUEL: message received", message)
        if (message.type == "duelWelcome" || message.type == "duelMutated") {
            this.onMessageReceived(message)
        }
    }
}