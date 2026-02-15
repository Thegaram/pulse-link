/**
 * State machine types for leader and peer
 */

/**
 * Leader state machine states
 */
export type LeaderState =
  | 'L_IDLE'
  | 'L_ROOM_OPEN'
  | 'L_RUNNING'
  | 'L_CLOSING';

/**
 * Peer state machine states
 */
export type PeerState =
  | 'C_IDLE'
  | 'C_DISCOVERING'
  | 'C_SIGNALING'
  | 'C_CONNECTING'
  | 'C_SYNCING'
  | 'C_RUNNING'
  | 'C_RECONNECTING'
  | 'C_FAILED';

/**
 * Shared state data
 */
export interface StateContext {
  roomId: string | null;
  myId: string;
  bpm: number;
  version: number;
}
