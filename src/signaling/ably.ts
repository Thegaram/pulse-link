/**
 * Ably Realtime adapter for signaling/pub-sub transport.
 * Assumes Ably SDK is loaded via CDN as window.Ably.
 */

import { SignalingTransport, MessageHandler } from './transport.js';
import { Message } from '../types.js';

export interface AblyConfig {
  key?: string;
  token?: string;
  clientId?: string;
}

export class AblySignaling implements SignalingTransport {
  private client: any = null;
  private channel: any = null;
  private messageHandler: MessageHandler | null = null;
  private connected = false;
  private roomId = '';
  private clientId = '';

  constructor(private readonly config: AblyConfig) {}

  async connect(roomId: string, clientId: string): Promise<void> {
    this.roomId = roomId;
    this.clientId = clientId;

    // @ts-ignore loaded via CDN
    if (typeof window.Ably === 'undefined') {
      throw new Error('Ably SDK not loaded. Include ably.min.js via CDN.');
    }

    const rawKey = this.config.key?.trim() ?? '';
    const rawToken = this.config.token?.trim() ?? '';
    const normalizedToken = rawToken.replace(/^Bearer\s+/i, '');
    const looksLikeApiKey = normalizedToken.includes(':');
    const key = rawKey || (looksLikeApiKey ? normalizedToken : '');
    const token = looksLikeApiKey ? '' : normalizedToken;

    if (!key && !token) {
      throw new Error(
        'Ably config missing credentials. Set ABLY_CONFIG.key or ABLY_CONFIG.token in config.js.'
      );
    }

    // @ts-ignore
    this.client = new window.Ably.Realtime({
      key: key || undefined,
      token: token || undefined,
      clientId: this.config.clientId ?? clientId
    });

    const channelName = `room:${roomId}`;
    this.channel = this.client.channels.get(channelName);

    this.channel.subscribe('message', (event: any) => {
      this.handleIncomingMessage(event.data as Message);
    });

    this.connected = true;
    console.log(`✅ Connected to Ably signaling channel: ${channelName}`);
  }

  async send(message: Message): Promise<void> {
    if (!this.connected || !this.channel) {
      throw new Error('Not connected to Ably signaling');
    }

    await this.channel.publish('message', message);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.channel.unsubscribe('message');
      this.channel = null;
    }

    if (this.client) {
      this.client.close();
      this.client = null;
    }

    this.connected = false;
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleIncomingMessage(message: Message): void {
    if (message.from === this.clientId) {
      return;
    }

    if (message.roomId !== this.roomId) {
      return;
    }

    if (message.to !== this.clientId && message.to !== '*') {
      return;
    }

    this.messageHandler?.(message);
  }
}
