import {duelLog} from "./log.ts";

export class DuelMessaging {
    managedSocket: WebSocket | null = null
    onMessageReceived: (message: DuelMessage) => void = () => {}
    
    msgQueue: LabMessage[] = []
    
    ready: boolean = false

    constructor(managedSocketUrl: string | URL | null) {
        if (managedSocketUrl) {
            this.managedSocket = new WebSocket(managedSocketUrl)
            this.managedSocket.addEventListener("message", 
                    m => this.receiveMessage(JSON.parse(m.data)));
        }
    }

    receiveMessage(message: LabMessage) {
        if (!this.ready) {
            this.msgQueue.push(message)
            return
        }
        
        duelLog(`Message received (${message.type})`, message)
        if (message.type == "duelWelcome" || message.type == "duelMutated") {
            this.onMessageReceived(message)
        }
    }
    
    readyToReceive() {
        if (!this.ready) {
            this.ready = true
            
            for (const msg of this.msgQueue) {
                this.receiveMessage(msg)
            }
        }
    }
}