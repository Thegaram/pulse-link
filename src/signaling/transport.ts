/**
 * Abstract signaling transport interface
 * Allows swapping signaling backends (Supabase, Socket.io, etc.)
 */

import { Message } from '../types.js';

/**
 * Callback type for receiving messages
 */
export type MessageHandler = (message: Message) => void;

/**
 * Abstract signaling transport
 * Used only for initial WebRTC connection setup (offer/answer/ICE)
 */
export interface SignalingTransport {
  /**
   * Connect to signaling server and join a room
   */
  connect(roomId: string, clientId: string): Promise<void>;

  /**
   * Send a message via signaling channel
   */
  send(message: Message): Promise<void>;

  /**
   * Register handler for incoming messages
   */
  onMessage(handler: MessageHandler): void;

  /**
   * Disconnect from signaling server
   */
  disconnect(): Promise<void>;

  /**
   * Check if connected
   */
  isConnected(): boolean;
}
