/**
 * Mock signaling transport for local testing
 * Uses BroadcastChannel API to simulate signaling between tabs
 */

import { SignalingTransport, MessageHandler } from './transport.js';
import { Message } from '../types.js';

/**
 * Mock signaling using BroadcastChannel (same-origin only)
 * Perfect for testing WebRTC in multiple browser tabs
 */
export class MockSignaling implements SignalingTransport {
  private channel: BroadcastChannel | null = null;
  private messageHandler: MessageHandler | null = null;
  private connected: boolean = false;
  private roomId: string = '';
  private clientId: string = '';

  async connect(roomId: string, clientId: string): Promise<void> {
    this.roomId = roomId;
    this.clientId = clientId;

    // Create BroadcastChannel for room
    const channelName = `pulse-link:${roomId}`;
    this.channel = new BroadcastChannel(channelName);

    // Listen for messages
    this.channel.onmessage = (event) => {
      this.handleIncomingMessage(event.data);
    };

    this.connected = true;
    console.log(`✅ Connected to mock signaling: ${channelName}`);
  }

  async send(message: Message): Promise<void> {
    if (!this.connected || !this.channel) {
      throw new Error('Not connected to signaling');
    }

    // Broadcast to all tabs
    this.channel.postMessage(message);
  }

  onMessage(handler: MessageHandler): void {
    this.messageHandler = handler;
  }

  async disconnect(): Promise<void> {
    if (this.channel) {
      this.channel.close();
      this.channel = null;
    }

    this.connected = false;
    console.log('✅ Disconnected from mock signaling');
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
