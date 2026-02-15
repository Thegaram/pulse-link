/**
 * Leader state machine
 * Manages room creation, peer connections, and metronome synchronization
 */

import { LeaderConnectionManager } from '../webrtc/leader.js';
import { MockSignaling } from '../signaling/mock.js';
import { RoomStateManager } from './room-state.js';
import { Metronome } from '../audio/metronome.js';
import { LeaderState } from './types.js';
import { generateRoomId, createMessage, StartAnnouncePayload } from '../types.js';
import { IceConfig } from '../webrtc/types.js';

const COUNTDOWN_MS = 5000; // 5 second countdown before start

export class LeaderStateMachine {
  private state: LeaderState = 'L_IDLE';
  private roomState: RoomStateManager | null = null;
  private connectionManager: LeaderConnectionManager | null = null;
  private metronome: Metronome;
  private myId: string;

  constructor(myId: string) {
    this.myId = myId;
    this.metronome = new Metronome();
  }

  /**
   * Create room and open for peers
   */
  async createRoom(bpm: number, iceConfig: IceConfig): Promise<string> {
    if (this.state !== 'L_IDLE') {
      throw new Error('Room already exists');
    }

    const roomId = generateRoomId();
    this.roomState = new RoomStateManager(roomId, this.myId, bpm);

    // Create signaling
    const signaling = new MockSignaling();
    await signaling.connect(roomId, this.myId);

    // Create connection manager
    this.connectionManager = new LeaderConnectionManager(
      roomId,
      this.myId,
      signaling,
      iceConfig
    );

    // Handle control messages from peers (if needed)
    this.connectionManager.onControl((data) => {
      console.log('📥 Control message from peer:', data);
    });

    this.state = 'L_ROOM_OPEN';
    console.log(`✅ Leader created room: ${roomId} at ${bpm} BPM`);

    return roomId;
  }

  /**
   * Start metronome with countdown
   */
  startMetronome(): void {
    if (this.state !== 'L_ROOM_OPEN') {
      throw new Error('Room not open');
    }

    if (!this.roomState || !this.connectionManager) {
      throw new Error('Room state not initialized');
    }

    const bpm = this.roomState.getState().bpm;
    const startAtLeaderMs = performance.now() + COUNTDOWN_MS;

    this.roomState.setStartTime(startAtLeaderMs);
    this.roomState.setStatus('countdown');

    // Broadcast start announcement to all peers
    const announcement: StartAnnouncePayload = {
      bpm,
      version: this.roomState.getState().version,
      anchorLeaderMs: startAtLeaderMs,
      beatIndexAtAnchor: 0 // Start from beat 0
    };

    const msg = createMessage(
      this.roomState.getState().roomId,
      this.myId,
      '*',
      'start_announce',
      announcement
    );

    this.connectionManager.broadcastControl(msg);

    // Start local metronome after countdown
    setTimeout(() => {
      this.metronome.setBeatGrid({
        bpm,
        anchorPerformanceMs: startAtLeaderMs,
        beatIndexAtAnchor: 0
      });

      this.metronome.start(bpm);
      this.roomState!.setStatus('running');
      this.state = 'L_RUNNING';

      console.log(`✅ Metronome started at ${bpm} BPM`);
    }, COUNTDOWN_MS);

    console.log(`⏳ Countdown started (${COUNTDOWN_MS}ms)`);
  }

  /**
   * Stop metronome
   */
  stopMetronome(): void {
    if (this.state !== 'L_RUNNING') {
      return;
    }

    this.metronome.stop();
    this.roomState?.setStatus('open');
    this.state = 'L_ROOM_OPEN';

    console.log('⏹ Metronome stopped');
  }

  /**
   * Update BPM (for future: while running)
   */
  setBPM(bpm: number): void {
    if (!this.roomState) {
      return;
    }

    this.roomState.setBPM(bpm);
    this.metronome.setBPM(bpm);

    // TODO: Broadcast param_update to peers
  }

  /**
   * Close room
   */
  async closeRoom(): Promise<void> {
    if (this.state === 'L_IDLE') {
      return;
    }

    this.state = 'L_CLOSING';

    // Stop metronome
    this.metronome.stop();

    // Notify peers
    if (this.connectionManager && this.roomState) {
      const msg = createMessage(
        this.roomState.getState().roomId,
        this.myId,
        '*',
        'room_closed',
        {}
      );

      this.connectionManager.broadcastControl(msg);

      // Close all connections
      await this.connectionManager.closeAll();
    }

    this.roomState = null;
    this.connectionManager = null;
    this.state = 'L_IDLE';

    console.log('✅ Room closed');
  }

  /**
   * Get current state
   */
  getState(): LeaderState {
    return this.state;
  }

  /**
   * Get room ID
   */
  getRoomId(): string | null {
    return this.roomState?.getState().roomId ?? null;
  }

  /**
   * Get BPM
   */
  getBPM(): number {
    return this.roomState?.getState().bpm ?? 120;
  }

  /**
   * Check if metronome is running
   */
  isRunning(): boolean {
    return this.state === 'L_RUNNING';
  }
}
