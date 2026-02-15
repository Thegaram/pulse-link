/**
 * Leader state machine
 * Manages room creation, peer connections, and metronome synchronization
 */

import { RoomStateManager } from './room-state.js';
import { Metronome } from '../audio/metronome.js';
import { LeaderState } from './types.js';
import { LeaderConnectionManagerLike } from '../realtime/connection-types.js';
import { TransportRuntime, createDefaultTransportRuntime } from '../realtime/runtime.js';
import {
  generateRoomId,
  createMessage,
  StartAnnouncePayload,
  ParamUpdatePayload,
  TimePingPayload,
  TimePongPayload
} from '../types.js';
import { ClockSync } from '../sync/clock.js';

const PING_INTERVAL_MS = 1000; // Send time ping every 1 second
const STALE_PEER_TTL_MS = 6000;
const STALE_PEER_SWEEP_MS = 1000;
const BPM_CHANGE_LEAD_MS = 300;
type ControlMessageType = 'start_announce' | 'stop_announce' | 'param_update' | 'clock_offset' | 'room_closed';

export interface LeaderPersistenceSnapshot {
  roomId: string;
  bpm: number;
  running: boolean;
  anchorLeaderMs?: number;
  beatIndexAtAnchor?: number;
}

export class LeaderStateMachine {
  private state: LeaderState = 'L_IDLE';
  private roomState: RoomStateManager | null = null;
  private connectionManager: LeaderConnectionManagerLike | null = null;
  private metronome: Metronome;
  private myId: string;
  private pingIntervals: Map<string, number> = new Map();
  private pingSeq: Map<string, number> = new Map();
  private clockSyncs: Map<string, ClockSync> = new Map();
  private staleSweepIntervalId: number | null = null;

  constructor(
    myId: string,
    private readonly transportRuntime: TransportRuntime = createDefaultTransportRuntime('pubsub')
  ) {
    this.myId = myId;
    this.metronome = new Metronome();
  }

  private sendControlToPeer(peerId: string, type: ControlMessageType, payload: unknown): void {
    this.connectionManager?.sendControl(peerId, { type, payload });
  }

  private broadcastControl(type: ControlMessageType, payload: unknown): void {
    this.connectionManager?.broadcastControl({ type, payload });
  }

  /**
   * Create room and open for peers
   */
  async createRoom(bpm: number, preferredRoomId?: string): Promise<string> {
    if (this.state !== 'L_IDLE') {
      throw new Error('Room already exists');
    }

    const roomId = preferredRoomId ?? generateRoomId();
    this.roomState = new RoomStateManager(roomId, this.myId, bpm);

    const signaling = this.transportRuntime.createSignaling();
    await signaling.connect(roomId, this.myId);

    this.connectionManager = this.transportRuntime.createLeaderConnection(roomId, this.myId, signaling);

    // Handle control messages from peers (if needed)
    this.connectionManager.onControl((data) => {
      console.log('📥 Control message from peer:', data);
    });

    // Handle time-sync messages (pongs from peers)
    this.connectionManager.onTimeSync((data) => {
      if (data.type === 'time_pong') {
        this.handleTimePong(data.peerId, data.payload);
      }
    });

    // Handle peer connections - start time sync when peer connects
    this.connectionManager.onPeerConnected((peerId) => {
      console.log(`✅ Peer connected: ${peerId}, starting time sync`);
      this.roomState?.addPeer(peerId);
      this.roomState?.markPeerConnected(peerId);
      this.startTimeSyncWithPeer(peerId);
      this.syncPeerState(peerId);
    });

    // Handle peer disconnections - stop time sync
    this.connectionManager.onPeerDisconnected((peerId) => {
      console.log(`❌ Peer disconnected: ${peerId}, stopping time sync`);
      this.roomState?.removePeer(peerId);
      this.stopTimeSyncWithPeer(peerId);
    });

    this.startStalePeerSweep();

    this.state = 'L_ROOM_OPEN';
    console.log(`✅ Leader created room: ${roomId} at ${bpm} BPM`);

    return roomId;
  }

  /**
   * Start time synchronization with a peer
   */
  private startTimeSyncWithPeer(peerId: string): void {
    if (!this.connectionManager) {
      return;
    }

    // Initialize clock sync for this peer
    this.clockSyncs.set(peerId, new ClockSync());
    this.pingSeq.set(peerId, 0);

    // Send first ping immediately, then continue periodically.
    this.sendTimePingToPeer(peerId);

    const intervalId = window.setInterval(() => {
      this.sendTimePingToPeer(peerId);
    }, PING_INTERVAL_MS);

    this.pingIntervals.set(peerId, intervalId);
  }

  /**
   * Send one time-sync ping to a peer.
   */
  private sendTimePingToPeer(peerId: string): void {
    if (!this.connectionManager) {
      return;
    }

    const seq = this.pingSeq.get(peerId) ?? 0;
    this.pingSeq.set(peerId, seq + 1);

    const t1 = performance.now();
    const ping: TimePingPayload = {
      seq,
      t1LeaderMs: t1
    };

    this.connectionManager.sendTimeSync(peerId, {
      type: 'time_ping',
      payload: ping
    });
  }

  /**
   * Handle time pong from peer
   */
  private handleTimePong(peerId: string, pong: TimePongPayload): void {
    const clockSync = this.clockSyncs.get(peerId);
    if (!clockSync || !this.connectionManager) {
      return;
    }

    const t4 = performance.now();

    // Calculate offset
    const stats = clockSync.processPong(
      pong.t1LeaderMs,
      pong.t2PeerMs,
      pong.t3PeerMs,
      t4
    );

    this.roomState?.markPeerConnected(peerId);

    // Send offset to peer via control channel
    this.sendControlToPeer(peerId, 'clock_offset', {
      offsetMs: stats.offsetMs,
      rtt: stats.rtt
    });

    console.log(`⏱️ Peer ${peerId} offset: ${stats.offsetMs.toFixed(2)}ms, RTT: ${stats.rtt.toFixed(2)}ms`);
  }

  /**
   * Stop time synchronization with a peer
   */
  private stopTimeSyncWithPeer(peerId: string): void {
    const intervalId = this.pingIntervals.get(peerId);
    if (intervalId) {
      clearInterval(intervalId);
      this.pingIntervals.delete(peerId);
    }
    this.pingSeq.delete(peerId);
    this.clockSyncs.delete(peerId);
  }

  private startStalePeerSweep(): void {
    if (this.staleSweepIntervalId !== null) {
      clearInterval(this.staleSweepIntervalId);
    }

    this.staleSweepIntervalId = window.setInterval(() => {
      if (!this.roomState) {
        return;
      }

      const stalePeerIds = this.roomState.getStalePeerIds(STALE_PEER_TTL_MS);
      for (const peerId of stalePeerIds) {
        console.log(`⌛ Peer stale timeout: ${peerId}`);
        this.roomState.removePeer(peerId);
        this.stopTimeSyncWithPeer(peerId);
      }
    }, STALE_PEER_SWEEP_MS);
  }

  private stopStalePeerSweep(): void {
    if (this.staleSweepIntervalId !== null) {
      clearInterval(this.staleSweepIntervalId);
      this.staleSweepIntervalId = null;
    }
  }

  /**
   * Send current room/playback state to a newly connected peer.
   */
  private syncPeerState(peerId: string): void {
    if (!this.connectionManager || !this.roomState) {
      return;
    }

    const state = this.roomState.getState();

    // Always send latest BPM/version so late joiners are aligned.
    const paramUpdate: ParamUpdatePayload = {
      bpm: state.bpm,
      version: state.version
    };
    this.sendControlToPeer(peerId, 'param_update', paramUpdate);

    // If playback already scheduled/running, send current anchor so peer can join in-phase.
    if ((state.status === 'countdown' || state.status === 'running') && state.startAtLeaderMs !== undefined) {
      const announcement: StartAnnouncePayload = {
        bpm: state.bpm,
        version: state.version,
        anchorLeaderMs: state.startAtLeaderMs,
        beatIndexAtAnchor: state.beatIndexAtAnchor ?? 0
      };

      this.sendControlToPeer(peerId, 'start_announce', announcement);
    }
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
    const startAtLeaderMs = performance.now();

    this.roomState.setBeatAnchor(startAtLeaderMs, 0);
    this.roomState.setStatus('running');
    this.state = 'L_RUNNING';

    // Broadcast start announcement to all peers
    const announcement: StartAnnouncePayload = {
      bpm,
      version: this.roomState.getState().version,
      anchorLeaderMs: startAtLeaderMs,
      beatIndexAtAnchor: 0 // Start from beat 0
    };

    this.broadcastControl('start_announce', announcement);

    // Start local metronome immediately.
    this.metronome.setBeatGrid({
      bpm,
      anchorPerformanceMs: startAtLeaderMs,
      beatIndexAtAnchor: 0
    });
    this.metronome.start(bpm);

    console.log(`✅ Metronome started at ${bpm} BPM`);
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

    // Tell peers to stop while keeping room open for future restarts.
    this.broadcastControl('stop_announce', {});

    console.log('⏹ Metronome stopped');
  }

  /**
   * Resume running playback from an existing beat anchor.
   * Used when restoring host session after page refresh.
   */
  resumeMetronomeFromAnchor(anchorLeaderMs: number, beatIndexAtAnchor: number): void {
    if (this.state !== 'L_ROOM_OPEN') {
      return;
    }

    if (!this.roomState || !this.connectionManager) {
      return;
    }

    const bpm = this.roomState.getState().bpm;
    this.roomState.setBeatAnchor(anchorLeaderMs, beatIndexAtAnchor);
    this.roomState.setStatus('running');
    this.state = 'L_RUNNING';

    const announcement: StartAnnouncePayload = {
      bpm,
      version: this.roomState.getState().version,
      anchorLeaderMs,
      beatIndexAtAnchor
    };
    this.broadcastControl('start_announce', announcement);

    this.metronome.setBeatGrid({
      bpm,
      anchorPerformanceMs: anchorLeaderMs,
      beatIndexAtAnchor
    });
    this.metronome.start(bpm);
  }

  /**
   * Update BPM (for future: while running)
   */
  setBPM(bpm: number): void {
    if (!this.roomState || !this.connectionManager) {
      return;
    }

    const previous = this.roomState.getState();
    if (previous.bpm === bpm) {
      return;
    }

    this.roomState.setBPM(bpm);

    const state = this.roomState.getState();
    const previousStartAtLeaderMs = previous.startAtLeaderMs;
    const running = this.state === 'L_RUNNING' && previousStartAtLeaderMs !== undefined;

    if (running) {
      // Re-anchor tempo change to a shared future beat so all peers switch phase-aligned.
      const now = performance.now();
      const msPerBeatOld = 60000 / previous.bpm;
      const baseBeatIndex = previous.beatIndexAtAnchor ?? 0;
      const elapsedMs = Math.max(0, now - previousStartAtLeaderMs);
      const beatsSinceAnchor = Math.floor(elapsedMs / msPerBeatOld);
      const currentBeatIndex = baseBeatIndex + beatsSinceAnchor;
      const currentBeatTime = previousStartAtLeaderMs + (currentBeatIndex - baseBeatIndex) * msPerBeatOld;
      const leadRemainingMs = Math.max(0, BPM_CHANGE_LEAD_MS - (now - currentBeatTime));
      const beatsAhead = Math.max(1, Math.ceil(leadRemainingMs / msPerBeatOld));
      const changeBeatIndex = currentBeatIndex + beatsAhead;
      const changeAtLeaderMs = previousStartAtLeaderMs + (changeBeatIndex - baseBeatIndex) * msPerBeatOld;

      this.roomState.setBeatAnchor(changeAtLeaderMs, changeBeatIndex);

      this.metronome.setBeatGrid({
        bpm,
        anchorPerformanceMs: changeAtLeaderMs,
        beatIndexAtAnchor: changeBeatIndex
      });

      const announcement: StartAnnouncePayload = {
        bpm,
        version: state.version,
        anchorLeaderMs: changeAtLeaderMs,
        beatIndexAtAnchor: changeBeatIndex
      };
      this.broadcastControl('start_announce', announcement);
      return;
    }

    const update: ParamUpdatePayload = {
      bpm,
      version: state.version
    };
    this.broadcastControl('param_update', update);
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
    this.stopStalePeerSweep();

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
   * Get current connected peer count
   */
  getPeerCount(): number {
    return this.roomState?.getPeerCount() ?? 0;
  }

  /**
   * Check if metronome is running
   */
  isRunning(): boolean {
    return this.state === 'L_RUNNING';
  }

  /**
   * Get metronome instance (for visual sync)
   */
  getMetronome(): Metronome {
    return this.metronome;
  }

  getPersistenceSnapshot(): LeaderPersistenceSnapshot | null {
    if (!this.roomState) {
      return null;
    }

    const state = this.roomState.getState();
    const running = state.status === 'running' && this.state === 'L_RUNNING';
    return {
      roomId: state.roomId,
      bpm: state.bpm,
      running,
      anchorLeaderMs: running ? state.startAtLeaderMs : undefined,
      beatIndexAtAnchor: running ? (state.beatIndexAtAnchor ?? 0) : undefined
    };
  }
}
