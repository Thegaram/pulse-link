/**
 * Supabase Realtime Broadcast adapter for WebRTC signaling
 * Uses Supabase Realtime Broadcast for ephemeral messaging (no database needed)
 */

import { SignalingTransport, MessageHandler } from './transport.js';
import { Message } from '../types.js';

/**
 * Supabase configuration
 */
export interface SupabaseConfig {
  url: string;
  anonKey: string;
}

/**
 * Supabase Realtime signaling transport
 * Note: This implementation assumes @supabase/supabase-js is loaded via CDN
 */
export class SupabaseSignaling implements SignalingTransport {
  private client: any = null;
  private channel: any = null;
  private messageHandler: MessageHandler | null = null;
  private connected: boolean = false;
  private roomId: string = '';
  private clientId: string = '';

  constructor(private config: SupabaseConfig) {}

  async connect(roomId: string, clientId: string): Promise<void> {
    this.roomId = roomId;
    this.clientId = clientId;

    // Create Supabase client (assumes global supabase is available)
    // @ts-ignore - supabase loaded via CDN
    if (typeof window.supabase === 'undefined') {
      throw new Error('Supabase client not loaded. Include @supabase/supabase-js via CDN.');
    }

    // @ts-ignore
    const { createClient } = window.supabase;
    this.client = createClient(this.config.url, this.config.anonKey);

    // Create channel for room
    const channelName = `room:${roomId}`;
    this.channel = this.client.channel(channelName);

    // Subscribe to broadcast events
    this.channel.on('broadcast', { event: 'message' }, (payload: any) => {
      this.handleIncomingMessage(payload.payload);
    });

    // Subscribe to channel
    await this.channel.subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        this.connected = true;
        console.log(`✅ Connected to signaling channel: ${channelName}`);
      }
    });
  }

  async send(message: Message): Promise<void> {
    if (!this.connected || !this.channel) {
      throw new Error('Not connected to signaling server');
    }

    // Broadcast message to all clients in channel
    await this.channel.send({
      type: 'broadcast',
      event: 'message',
      payload: message
    });
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      await this.channel.unsubscribe();
      this.channel = null;
    }

    this.connected = false;
    console.log('✅ Disconnected from signaling channel');
  }

  isConnected(): boolean {
    return this.connected;
  }

  private handleIncomingMessage(message: Message): void {
    // Ignore messages from self
    if (message.from === this.clientId) {
      return;
    }

    // Ignore messages not for this room
    if (message.roomId !== this.roomId) {
      return;
    }

    // Ignore messages not addressed to this client (or broadcast)
    if (message.to !== this.clientId && message.to !== '*') {
      return;
    }

    // Deliver to handler
    if (this.messageHandler) {
      this.messageHandler(message);
    }
  }
}
