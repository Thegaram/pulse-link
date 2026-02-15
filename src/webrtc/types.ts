/**
 * WebRTC-specific types and interfaces
 */

/**
 * WebRTC connection state
 */
export type RTCConnectionState =
  | 'new'
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'failed'
  | 'closed';

/**
 * Callback types
 */
export type DataChannelMessageHandler = (data: any) => void;
export type ConnectionStateHandler = (state: RTCConnectionState) => void;

/**
 * Dual DataChannel pair
 */
export interface DataChannelPair {
  timeSync: RTCDataChannel; // Unordered, unreliable for ping/pong
  control: RTCDataChannel; // Ordered, reliable for state updates
}

/**
 * ICE server configuration
 */
export interface IceConfig {
  iceServers: RTCIceServer[];
}
