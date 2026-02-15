import { DataChannelMessageHandler } from '../webrtc/types.js';

export interface LeaderConnectionManagerLike {
  onTimeSync(handler: DataChannelMessageHandler): void;
  onControl(handler: DataChannelMessageHandler): void;
  onPeerConnected(callback: (peerId: string) => void): void;
  onPeerDisconnected(callback: (peerId: string) => void): void;
  sendTimeSync(peerId: string, data: any): void;
  sendControl(peerId: string, data: any): void;
  broadcastControl(data: any): void;
  closeAll(): Promise<void>;
}

export interface PeerConnectionManagerLike {
  joinRoom(): Promise<void>;
  onTimeSync(handler: DataChannelMessageHandler): void;
  onControl(handler: DataChannelMessageHandler): void;
  onConnected(callback: () => void): void;
  sendTimeSync(data: any): void;
  sendControl(data: any): void;
  isConnected(): boolean;
  close(): Promise<void>;
}
