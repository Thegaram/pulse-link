/**
 * Room state management
 * Leader-owned ephemeral state
 */

import { RoomState } from '../types.js';

export class RoomStateManager {
  private state: RoomState;

  constructor(roomId: string, leaderId: string, bpm: number = 120) {
    this.state = {
      roomId,
      leaderId,
      bpm,
      version: 0,
      status: 'open',
      peers: {}
    };
  }

  /**
   * Add a peer to the room
   */
  addPeer(peerId: string): void {
    this.state.peers[peerId] = {
      peerId,
      status: 'connecting',
      lastSeenMs: performance.now()
    };
  }

  /**
   * Mark peer as connected
   */
  markPeerConnected(peerId: string): void {
    const peer = this.state.peers[peerId];
    if (peer) {
      peer.status = 'connected';
      peer.lastSeenMs = performance.now();
    }
  }

  /**
   * Remove a peer from the room
   */
  removePeer(peerId: string): void {
    delete this.state.peers[peerId];
  }

  /**
   * Update BPM
   */
  setBPM(bpm: number): void {
    this.state.bpm = bpm;
    this.state.version++;
  }

  /**
   * Set room status
   */
  setStatus(status: RoomState['status']): void {
    this.state.status = status;
  }

  /**
   * Set start time
   */
  setStartTime(timeMs: number): void {
    this.state.startAtLeaderMs = timeMs;
  }

  /**
   * Get current state
   */
  getState(): RoomState {
    return { ...this.state };
  }

  /**
   * Get connected peer IDs
   */
  getConnectedPeers(): string[] {
    return Object.values(this.state.peers)
      .filter(p => p.status === 'connected')
      .map(p => p.peerId);
  }

  /**
   * Get peer count
   */
  getPeerCount(): number {
    return Object.keys(this.state.peers).length;
  }
}
