/**
 * Peer state machine
 * Manages joining room, syncing clock, and playing synchronized metronome
 */

import { ClockSync } from '../sync/clock.js';
import { Metronome } from '../audio/metronome.js';
import { PeerState } from './types.js';
import { StartAnnouncePayload, ParamUpdatePayload, TimePingPayload, TimePongPayload, ClockOffsetPayload } from '../types.js';
import { PeerConnectionManagerLike } from '../realtime/connection-types.js';
import { TransportRuntime, createDefaultTransportRuntime } from '../realtime/runtime.js';

const MIN_OFFSET_SAMPLES_FOR_START = 2;
const PEER_SYNC_DELAY_MS = 250;

export class PeerStateMachine {
  private state: PeerState = 'C_IDLE';
  private connectionManager: PeerConnectionManagerLike | null = null;
  private clockSync: ClockSync;
  private metronome: Metronome;
  private myId: string;
  private roomId: string | null = null;
  private onStartCallback: (() => void) | null = null;
  private onSyncStatusCallback: ((status: string) => void) | null = null;
  private hasClockOffset: boolean = false;
  private offsetUpdateCount: number = 0;
  private pendingStartAnnouncement: StartAnnouncePayload | null = null;
  private pendingStartTimeoutId: number | null = null;

  constructor(
    myId: string,
    private readonly transportRuntime: TransportRuntime = createDefaultTransportRuntime('pubsub')
  ) {
    this.myId = myId;
    this.clockSync = new ClockSync();
    this.metronome = new Metronome();
  }

  private clearPendingStart(): void {
    if (this.pendingStartTimeoutId !== null) {
      clearTimeout(this.pendingStartTimeoutId);
      this.pendingStartTimeoutId = null;
    }
    this.pendingStartAnnouncement = null;
  }

  /**
   * Join room
   */
  async joinRoom(roomId: string): Promise<void> {
    if (this.state !== 'C_IDLE') {
      throw new Error('Already in a room');
    }

    this.roomId = roomId;
    this.state = 'C_DISCOVERING';

    const signaling = this.transportRuntime.createSignaling();
    await signaling.connect(roomId, this.myId);

    this.connectionManager = this.transportRuntime.createPeerConnection(roomId, this.myId, signaling);

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
      } else if (data.type === 'clock_offset') {
        this.handleClockOffset(data.payload);
      } else if (data.type === 'param_update') {
        this.handleParamUpdate(data.payload);
      } else if (data.type === 'stop_announce') {
        this.handleStopAnnounce();
      }
    });

    // Handle connection
    this.connectionManager.onConnected(() => {
      const wasRunning = this.state === 'C_RUNNING' || this.metronome.running();
      this.clearPendingStart();
      this.clockSync.reset();
      this.hasClockOffset = false;
      this.offsetUpdateCount = 0;

      if (wasRunning) {
        this.state = 'C_RUNNING';
        console.log('✅ Reconnected to leader while running; keeping running state');
        this.emitSyncStatus('Running.');
        return;
      }

      this.state = 'C_SYNCING';
      console.log('✅ Connected to leader, syncing clock...');
      this.emitSyncStatus('Connected. Waiting for host to start.');
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
  }

  /**
   * Handle clock offset update from leader
   */
  private handleClockOffset(payload: ClockOffsetPayload): void {
    console.log(`⏱️ Clock offset update: ${payload.offsetMs.toFixed(2)}ms (RTT: ${payload.rtt.toFixed(2)}ms)`);

    // Apply leader-calculated offset directly.
    this.clockSync.setOffsetMs(payload.offsetMs);
    this.offsetUpdateCount++;
    this.hasClockOffset = this.offsetUpdateCount >= MIN_OFFSET_SAMPLES_FOR_START;

    // Late join: only schedule start after we have a usable offset sample.
    if (this.pendingStartAnnouncement) {
      if (this.hasClockOffset) {
        const pending = this.pendingStartAnnouncement;
        this.pendingStartAnnouncement = null;
        this.scheduleStartFromAnnouncement(pending);
      } else {
        this.emitSyncStatus('Synchronizing clocks...');
      }
    }
  }

  /**
   * Handle start announcement from leader
   */
  private handleStartAnnounce(payload: StartAnnouncePayload): void {
    console.log('🎵 Received start announcement:', payload);

    // Wait for at least one clock offset sample before scheduling start.
    if (!this.hasClockOffset) {
      this.pendingStartAnnouncement = payload;
      this.emitSyncStatus('Synchronizing clocks...');
      return;
    }

    this.scheduleStartFromAnnouncement(payload);
  }

  /**
   * Schedule local playback from leader announcement.
   */
  private scheduleStartFromAnnouncement(payload: StartAnnouncePayload): void {
    this.clearPendingStart();

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
    const startupDelayMs = Math.max(delayMs, PEER_SYNC_DELAY_MS);

    console.log(`⏳ Starting in ${startupDelayMs}ms (offset: ${offsetMs}ms)`);
    this.emitSyncStatus('Synchronizing clocks...');

    // Start metronome at anchor time
    this.pendingStartTimeoutId = window.setTimeout(() => {
      this.pendingStartTimeoutId = null;
      this.metronome.start(bpm);
      this.state = 'C_RUNNING';

      // Notify UI when playback actually begins.
      if (this.onStartCallback) {
        this.onStartCallback();
      }

      console.log('✅ Metronome started in sync!');
    }, startupDelayMs);
  }

  /**
   * Handle parameter updates from leader (currently BPM).
   */
  private handleParamUpdate(payload: ParamUpdatePayload): void {
    if (payload.bpm === undefined) {
      return;
    }

    // Running tempo changes are phase-anchored via start_announce.
    // Apply param updates only while not actively running.
    if (this.state !== 'C_RUNNING') {
      this.metronome.setBPM(payload.bpm);
    }
  }

  /**
   * Handle stop notification from leader.
   */
  private handleStopAnnounce(): void {
    this.clearPendingStart();
    this.metronome.stop();
    this.state = 'C_SYNCING';
    this.emitSyncStatus('Connected. Waiting for host to start.');
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
    this.clearPendingStart();

    this.metronome.stop();

    if (this.connectionManager) {
      await this.connectionManager.close();
      this.connectionManager = null;
    }

    this.roomId = null;
    this.state = 'C_IDLE';
    this.clockSync.reset();
    this.hasClockOffset = false;
    this.offsetUpdateCount = 0;

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

  /**
   * Get metronome instance (for visual sync)
   */
  getMetronome(): Metronome {
    return this.metronome;
  }

  /**
   * Register callback for peer sync status text.
   */
  onSyncStatus(callback: (status: string) => void): void {
    this.onSyncStatusCallback = callback;
  }

  /**
   * Register callback for when metronome starts
   */
  onStart(callback: () => void): void {
    this.onStartCallback = callback;
  }

  private emitSyncStatus(status: string): void {
    if (this.onSyncStatusCallback) {
      this.onSyncStatusCallback(status);
    }
  }
}
