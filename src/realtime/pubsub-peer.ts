import { SignalingTransport } from '../signaling/transport.js';
import { DataChannelMessageHandler } from '../webrtc/types.js';
import { Message, MessageType, createMessage } from '../types.js';

const CONTROL_TYPES = new Set<MessageType>([
  'start_announce',
  'stop_announce',
  'param_update',
  'room_closed',
  'clock_offset'
]);

export class PeerPubSubConnectionManager {
  private leaderId = '';
  private connected = false;
  private joinRetryIntervalId: number | null = null;
  private static readonly JOIN_ANNOUNCE_INTERVAL_MS = 2000;

  private onTimeSyncMessage: DataChannelMessageHandler | null = null;
  private onControlMessage: DataChannelMessageHandler | null = null;
  private onConnectedCallback: (() => void) | null = null;

  constructor(
    private readonly roomId: string,
    private readonly peerId: string,
    private readonly signaling: SignalingTransport
  ) {
    this.signaling.onMessage((message) => {
      void this.handleMessage(message);
    });
  }

  async joinRoom(): Promise<void> {
    await this.sendJoin();
    this.startJoinAnnounceLoop();
  }

  private async sendJoin(): Promise<void> {
    const join = createMessage(this.roomId, this.peerId, '*', 'join', { peerId: this.peerId });
    await this.signaling.send(join);
  }

  private async handleMessage(message: Message): Promise<void> {
    if (message.type === 'leader_hello') {
      const wasConnected = this.connected;
      const previousLeaderId = this.leaderId;
      this.leaderId = message.from;
      const leaderChanged =
        wasConnected && previousLeaderId !== '' && previousLeaderId !== this.leaderId;

      if (!wasConnected || leaderChanged) {
        this.connected = true;
        this.onConnectedCallback?.();
      }
      return;
    }

    if (this.leaderId && message.from !== this.leaderId) {
      return;
    }

    if (message.type === 'time_ping') {
      this.onTimeSyncMessage?.({ type: 'time_ping', payload: message.payload });
      return;
    }

    if (CONTROL_TYPES.has(message.type)) {
      this.onControlMessage?.({ type: message.type, payload: message.payload });
    }
  }

  private startJoinAnnounceLoop(): void {
    if (this.joinRetryIntervalId !== null) {
      clearInterval(this.joinRetryIntervalId);
    }

    // Keep announcing join periodically even while connected so a refreshed host can rediscover peers.
    this.joinRetryIntervalId = window.setInterval(() => {
      void this.sendJoin();
    }, PeerPubSubConnectionManager.JOIN_ANNOUNCE_INTERVAL_MS);
  }

  onTimeSync(handler: DataChannelMessageHandler): void {
    this.onTimeSyncMessage = handler;
  }

  onControl(handler: DataChannelMessageHandler): void {
    this.onControlMessage = handler;
  }

  onConnected(callback: () => void): void {
    this.onConnectedCallback = callback;
  }

  sendTimeSync(data: any): void {
    if (!this.connected || !this.leaderId) {
      return;
    }

    const type = data?.type as MessageType;
    if (!type) {
      return;
    }

    const msg = createMessage(this.roomId, this.peerId, this.leaderId, type, data.payload);
    void this.signaling.send(msg);
  }

  sendControl(data: any): void {
    if (!this.connected || !this.leaderId) {
      return;
    }

    const type = data?.type as MessageType;
    if (!type) {
      return;
    }

    const msg = createMessage(this.roomId, this.peerId, this.leaderId, type, data.payload);
    void this.signaling.send(msg);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async close(): Promise<void> {
    if (this.joinRetryIntervalId !== null) {
      clearInterval(this.joinRetryIntervalId);
      this.joinRetryIntervalId = null;
    }

    if (this.connected && this.leaderId) {
      const bye = createMessage(this.roomId, this.peerId, this.leaderId, 'peer_bye', {});
      await this.signaling.send(bye);
    }

    this.connected = false;
    this.leaderId = '';
    await this.signaling.disconnect();
  }
}
