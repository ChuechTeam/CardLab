import {duelLog} from "./log.ts";

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
        duelLog(`Message received (${message.type})`, message)
        if (message.type == "duelWelcome" || message.type == "duelMutated") {
            this.onMessageReceived(message)
        }
    }
}