/**
 * Peer state machine
 * Manages joining room, syncing clock, and playing synchronized metronome
 */

import { PeerConnectionManager } from '../webrtc/peer.js';
import { MockSignaling } from '../signaling/mock.js';
import { ClockSync } from '../sync/clock.js';
import { Metronome } from '../audio/metronome.js';
import { PeerState } from './types.js';
import { StartAnnouncePayload, TimePingPayload, TimePongPayload } from '../types.js';
import { IceConfig } from '../webrtc/types.js';

export class PeerStateMachine {
  private state: PeerState = 'C_IDLE';
  private connectionManager: PeerConnectionManager | null = null;
  private clockSync: ClockSync;
  private metronome: Metronome;
  private myId: string;
  private roomId: string | null = null;

  constructor(myId: string) {
    this.myId = myId;
    this.clockSync = new ClockSync();
    this.metronome = new Metronome();
  }

  /**
   * Join room
   */
  async joinRoom(roomId: string, iceConfig: IceConfig): Promise<void> {
    if (this.state !== 'C_IDLE') {
      throw new Error('Already in a room');
    }

    this.roomId = roomId;
    this.state = 'C_DISCOVERING';

    // Create signaling
    const signaling = new MockSignaling();
    await signaling.connect(roomId, this.myId);

    // Create connection manager
    this.connectionManager = new PeerConnectionManager(
      roomId,
      this.myId,
      signaling,
      iceConfig
    );

    this.state = 'C_SIGNALING';

    // Handle time-sync messages (pings from leader)
    this.connectionManager.onTimeSync((data) => {
      if (data.type === 'time_ping') {
        this.handleTimePing(data.payload);
      }
    });

    // Handle control messages (start announcements)
    this.connectionManager.onControl((data) => {
      if (data.type === 'start_announce') {
        this.handleStartAnnounce(data.payload);
      } else if (data.type === 'room_closed') {
        this.handleRoomClosed();
      }
    });

    // Handle connection
    this.connectionManager.onConnected(() => {
      this.state = 'C_SYNCING';
      console.log('✅ Connected to leader, syncing clock...');
    });

    // Join room
    await this.connectionManager.joinRoom();

    console.log(`✅ Peer joining room: ${roomId}`);
  }

  /**
   * Handle time ping from leader
   */
  private handleTimePing(pingPayload: TimePingPayload): void {
    const t2 = performance.now();
    const t3 = performance.now();

    const pong: TimePongPayload = {
      seq: pingPayload.seq,
      t1LeaderMs: pingPayload.t1LeaderMs,
      t2PeerMs: t2,
      t3PeerMs: t3
    };

    // Send pong immediately
    this.connectionManager?.sendTimeSync({
      type: 'time_pong',
      payload: pong
    });

    // For peer: we don't have t4, so we can't calculate offset directly
    // In a real implementation, leader would send back the calculated offset
    // For now, we'll just track that we're receiving pings
    if (this.state === 'C_SYNCING') {
      // After receiving a few pings, consider ourselves synced
      // In production, wait for leader to send offset via control channel
      console.log('📡 Received time ping, clock syncing...');
    }
  }

  /**
   * Handle start announcement from leader
   */
  private handleStartAnnounce(payload: StartAnnouncePayload): void {
    console.log('🎵 Received start announcement:', payload);

    // Note: In production, we would use the clock offset here
    // For V1 MVP, we'll use the leader's timestamp directly
    // assuming local network with minimal offset

    const { bpm, anchorLeaderMs, beatIndexAtAnchor } = payload;

    // Convert leader anchor to peer time (using clock offset)
    const offsetMs = this.clockSync.getOffsetMs();
    const anchorPeerMs = anchorLeaderMs + offsetMs;

    // Set beat grid
    this.metronome.setBeatGrid({
      bpm,
      anchorPerformanceMs: anchorPeerMs,
      beatIndexAtAnchor
    });

    // Calculate time until start
    const now = performance.now();
    const delayMs = Math.max(0, anchorPeerMs - now);

    console.log(`⏳ Starting in ${delayMs}ms (offset: ${offsetMs}ms)`);

    // Start metronome at anchor time
    setTimeout(() => {
      this.metronome.start(bpm);
      this.state = 'C_RUNNING';
      console.log('✅ Metronome started in sync!');
    }, delayMs);
  }

  /**
   * Handle room closed notification
   */
  private handleRoomClosed(): void {
    console.log('❌ Room closed by leader');
    this.leaveRoom();
  }

  /**
   * Leave room
   */
  async leaveRoom(): Promise<void> {
    this.metronome.stop();

    if (this.connectionManager) {
      await this.connectionManager.close();
      this.connectionManager = null;
    }

    this.roomId = null;
    this.state = 'C_IDLE';
    this.clockSync.reset();

    console.log('✅ Left room');
  }

  /**
   * Get current state
   */
  getState(): PeerState {
    return this.state;
  }

  /**
   * Get room ID
   */
  getRoomId(): string | null {
    return this.roomId;
  }

  /**
   * Check if metronome is running
   */
  isRunning(): boolean {
    return this.state === 'C_RUNNING';
  }

  /**
   * Get clock sync stats
   */
  getClockStats() {
    return this.clockSync.getStats();
  }
}
