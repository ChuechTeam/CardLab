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

    simulatedLatency: number | null = null; // Amount of latency in ms to simulate, for debugging
    simulateRequestFailure: boolean = false; // Whether to simulate request failures, for debugging

    onMessageReceived: (message: DuelMessage) => void = () => {
    }
    onConnectionLost: () => void = () => {
    }
    onConnectionEstablished: () => void = () => {
    }

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
        duelLog("Connection to server lost!");
    }

    receiveMessage(message: LabMessage, skipLatency = false) {
        if (!this.ready) {
            this.msgQueue.push(message)
            return
        }

        if (this.simulatedLatency !== null && !skipLatency) {
            setTimeout(() => this.receiveMessage(message, true), this.simulatedLatency / 2);
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
                this.pendingRequests.delete(message.requestId)
                callback(message.type === "duelRequestAck" ? {status: "ok"} : {
                    status: "error",
                    message: message.reason
                });
            }
        }
    }

    sendMessage(message: DuelMessage, skipLatency: boolean = false) {
        if (this.simulatedLatency !== null && !skipLatency) {
            setTimeout(() => this.sendMessage(message, true), this.simulatedLatency / 2);
            return
        }

        if (this.messageSender) {
            this.messageSender(message)
        } else if (this.managedSocket) {
            this.managedSocket.send(JSON.stringify(message))
        } else {
            duelLogError(`No message sender for sending message ${message.type}!`);
            throw new Error();
        }
    }

    sendRequest<T extends DuelRequestMessage>(msgFunc: (id: number) => T): [T, Promise<RequestResult>] {
        const msg = msgFunc(this.generateReqId())
        if (!this.simulateRequestFailure) {
            this.sendMessage(msg)

            return [msg, new Promise<RequestResult>(resolve => {
                this.pendingRequests.set(msg.header.requestId, resolve);
            })];
        } else {
            const prom = new Promise<RequestResult>(resolve => {
                setTimeout(() => resolve({ status: "error", message: "Simulated failure" })
                ,this.simulatedLatency ?? 100)
            });
            return [msg, prom];
        }
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

    dismount() {
        this.pendingRequests.clear();
        this.managedSocket?.close();
        this.msgQueue.length = 0;
        this.ready = false;
        this.connected = false;
        this.onMessageReceived = () => {
        };
        this.onConnectionEstablished = () => {
        };
        this.onConnectionLost = () => {
        };
    }
}