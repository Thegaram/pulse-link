/**
 * Shared TypeScript types for Pulse Link
 * Core message protocol and data structures
 */

/**
 * Message envelope for all communication (signaling + DataChannel)
 */
export interface Message {
  v: 1;
  roomId: string;
  from: string;
  to: string | "*"; // "*" for broadcast
  type: MessageType;
  ts: number; // performance.now() timestamp
  payload: any;
}

export type MessageType =
  // Signaling messages (Supabase Realtime)
  | "join"
  | "peer_bye"
  | "leader_hello"
  | "offer"
  | "answer"
  | "ice"
  // Control channel messages (WebRTC DataChannel)
  | "start_announce"
  | "stop_announce"
  | "param_update"
  | "clock_offset"
  | "room_closed"
  // Time sync channel messages (WebRTC DataChannel)
  | "time_ping"
  | "time_pong";

/**
 * Payload for join message (peer → signaling)
 */
export interface JoinPayload {
  peerId: string;
}

/**
 * Payload for leader_hello message (leader → peer via signaling)
 */
export interface LeaderHelloPayload {
  leaderId: string;
}

/**
 * Payload for WebRTC offer/answer
 */
export interface OfferPayload {
  sdp: string;
}

export interface AnswerPayload {
  sdp: string;
}

/**
 * Payload for ICE candidate
 */
export interface IceCandidatePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

/**
 * Payload for start_announce (leader → peers)
 */
export interface StartAnnouncePayload {
  bpm: number;
  version: number;
  anchorLeaderMs: number; // Timestamp in leader's performance.now() clock
  beatIndexAtAnchor: number; // Absolute beat index at anchor
}

/**
 * Payload for param_update (leader → peers)
 */
export interface ParamUpdatePayload {
  bpm?: number;
  version: number;
}

/**
 * Payload for clock offset update (leader -> peer)
 */
export interface ClockOffsetPayload {
  offsetMs: number;
  rtt: number;
}

/**
 * Payload for time_ping (leader → peer)
 */
export interface TimePingPayload {
  seq: number;
  t1LeaderMs: number; // Leader send time
}

/**
 * Payload for time_pong (peer → leader)
 */
export interface TimePongPayload {
  seq: number;
  t1LeaderMs: number; // Original leader send time
  t2PeerMs: number;   // Peer receive time
  t3PeerMs: number;   // Peer send time
}

/**
 * Peer connection state
 */
export interface PeerConnState {
  peerId: string;
  status: "connecting" | "connected" | "disconnected";
  lastSeenMs: number;
}

/**
 * Room state (leader-owned)
 */
export interface RoomState {
  roomId: string;
  leaderId: string;
  bpm: number;
  version: number;
  status: "open" | "countdown" | "running" | "closed";
  startAtLeaderMs?: number;
  beatIndexAtAnchor?: number;
  peers: Record<string, PeerConnState>;
}

/**
 * Helper to create a message envelope
 */
export function createMessage(
  roomId: string,
  from: string,
  to: string | "*",
  type: MessageType,
  payload: any
): Message {
  return {
    v: 1,
    roomId,
    from,
    to,
    type,
    ts: performance.now(),
    payload
  };
}

/**
 * Generate a random room ID (6 alphanumeric characters)
 */
export function generateRoomId(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Remove ambiguous chars
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

/**
 * Generate a random peer/leader ID
 */
export function generatePeerId(): string {
  return Math.random().toString(36).substring(2, 15);
}
