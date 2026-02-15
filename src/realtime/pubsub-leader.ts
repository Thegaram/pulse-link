import { SignalingTransport } from '../signaling/transport.js';
import { DataChannelMessageHandler } from '../webrtc/types.js';
import { Message, MessageType, createMessage } from '../types.js';

function isEnvelope(data: any): data is Message {
  return data && data.v === 1 && typeof data.type === 'string' && typeof data.roomId === 'string';
}

export class HostPubSubConnectionManager {
  private peers: Set<string> = new Set();
  private onTimeSyncMessage: DataChannelMessageHandler | null = null;
  private onControlMessage: DataChannelMessageHandler | null = null;
  private onPeerConnectedCallback: ((peerId: string) => void) | null = null;
  private onPeerDisconnectedCallback: ((peerId: string) => void) | null = null;

  constructor(
    private readonly roomId: string,
    private readonly leaderId: string,
    private readonly signaling: SignalingTransport
  ) {
    this.signaling.onMessage((message) => {
      void this.handleMessage(message);
    });
  }

  private async handleMessage(message: Message): Promise<void> {
    switch (message.type) {
      case 'join':
        await this.handlePeerJoin(message.from);
        return;
      case 'peer_bye':
        this.handlePeerBye(message.from);
        return;
      case 'time_pong':
        this.onTimeSyncMessage?.({ peerId: message.from, type: 'time_pong', payload: message.payload });
        return;
      default:
        if (message.from === this.leaderId) {
          return;
        }
        this.onControlMessage?.({ peerId: message.from, type: message.type, payload: message.payload });
    }
  }

  private async handlePeerJoin(peerId: string): Promise<void> {
    const isNewPeer = !this.peers.has(peerId);
    this.peers.add(peerId);

    const hello = createMessage(this.roomId, this.leaderId, peerId, 'leader_hello', {
      leaderId: this.leaderId
    });
    await this.signaling.send(hello);

    if (isNewPeer) {
      this.onPeerConnectedCallback?.(peerId);
    }
  }

  private handlePeerBye(peerId: string): void {
    if (!this.peers.has(peerId)) {
      return;
    }

    this.peers.delete(peerId);
    this.onPeerDisconnectedCallback?.(peerId);
  }

  onTimeSync(handler: DataChannelMessageHandler): void {
    this.onTimeSyncMessage = handler;
  }

  onControl(handler: DataChannelMessageHandler): void {
    this.onControlMessage = handler;
  }

  onPeerConnected(callback: (peerId: string) => void): void {
    this.onPeerConnectedCallback = callback;
  }

  onPeerDisconnected(callback: (peerId: string) => void): void {
    this.onPeerDisconnectedCallback = callback;
  }

  sendTimeSync(peerId: string, data: any): void {
    if (!this.peers.has(peerId)) {
      return;
    }

    const type = data?.type as MessageType;
    if (!type) {
      return;
    }

    const message = createMessage(this.roomId, this.leaderId, peerId, type, data.payload);
    void this.signaling.send(message);
  }

  sendControl(peerId: string, data: any): void {
    if (!this.peers.has(peerId)) {
      return;
    }

    const message = this.toMessage(peerId, data);
    if (!message) {
      return;
    }

    void this.signaling.send(message);
  }

  broadcastControl(data: any): void {
    const message = this.toMessage('*', data);
    if (!message) {
      return;
    }

    void this.signaling.send(message);
  }

  private toMessage(to: string | '*', data: any): Message | null {
    if (isEnvelope(data)) {
      return {
        ...data,
        roomId: this.roomId,
        from: this.leaderId,
        to
      };
    }

    const type = data?.type as MessageType;
    if (!type) {
      return null;
    }

    return createMessage(this.roomId, this.leaderId, to, type, data.payload);
  }

  async closeAll(): Promise<void> {
    for (const peerId of this.peers) {
      this.onPeerDisconnectedCallback?.(peerId);
    }
    this.peers.clear();
    await this.signaling.disconnect();
  }
}
