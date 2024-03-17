import {duelLog, duelLogError} from "./log.ts";

export type RequestResult =
    | { status: "ok" }
    | { status: "error", message: string }
    | { status: "cancelled" }

export class DuelMessaging {
    managedSocket: WebSocket | null = null
    messageSender: ((message: DuelMessage) => void) | null = null
    msgQueue: LabMessage[] = []
    ready: boolean = false
    reqIdSeq: number = 0;
    pendingRequests = new Map<number, (func: RequestResult) => void>()
    connected: boolean = false;

    onMessageReceived: (message: DuelMessage) => void = () => {
    }
    onConnectionLost: () => void = () => {}
    onConnectionEstablished: () => void = () => {}

    constructor(managedSocketUrl: string | URL | null) {
        if (managedSocketUrl) {
            this.managedSocket = new WebSocket(managedSocketUrl)
            this.managedSocket.addEventListener("message",
                m => this.receiveMessage(JSON.parse(m.data)));
            this.managedSocket.addEventListener("close", () => this.reportDisconnected());
            this.connected = true;
        }
    }

    reportConnected() {
        this.connected = true;
        this.onConnectionEstablished()
    }

    reportDisconnected() {
        this.connected = false;
        for (let resolver of this.pendingRequests.values()) {
            resolver({status: "cancelled"});
        }
        this.pendingRequests.clear();
        
        this.onConnectionLost()
    }

    receiveMessage(message: LabMessage) {
        if (!this.ready) {
            this.msgQueue.push(message)
            return
        }

        duelLog(`Message received (${message.type})`, message)
        if (message.type == "duelWelcome" || message.type == "duelMutated") {
            this.onMessageReceived(message)
        } else if (message.type === "duelRequestFailed" || message.type === "duelRequestAck") {
            const callback = this.pendingRequests.get(message.requestId)
            if (callback === undefined) {
                duelLogError(`Received response for unknown request ${message.requestId}!`);
            } else {
                callback(message.type === "duelRequestAck" ? {status: "ok"} : {
                    status: "error",
                    message: message.reason
                });
            }
        }
    }

    sendRequest<T extends DuelRequestMessage>(msgFunc: (id: number) => T): [T, Promise<RequestResult>] {
        const msg = msgFunc(this.generateReqId())
        if (this.messageSender) {
            this.messageSender(msg)
        } else if (this.managedSocket) {
            this.managedSocket.send(JSON.stringify(msg))
        } else {
            duelLogError(`No message sender for sending message ${msg.type}!`);
            throw new Error();
        }

        return [msg, new Promise<RequestResult>(resolve => {
            this.pendingRequests.set(msg.header.requestId, resolve);
        })];
    }

    generateReqId() {
        return this.reqIdSeq++;
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