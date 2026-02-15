/**
 * Continuous time synchronization engine
 * Sends periodic pings to maintain accurate clock offset
 */

import { ClockSync, ClockStats } from './clock.js';
import { TimePingPayload, TimePongPayload } from '../types.js';

const PING_INTERVAL_MS = 1500; // Send ping every 1.5 seconds

export type PingSender = (payload: TimePingPayload) => void;
export type StatsCallback = (stats: ClockStats) => void;

/**
 * Sync engine for leader side (sends pings)
 */
export class LeaderSyncEngine {
  private clockSync: Map<string, ClockSync> = new Map();
  private pingSeq: Map<string, number> = new Map();
  private pingTimers: Map<string, number> = new Map();
  private sendPing: PingSender;
  private onStatsUpdate: StatsCallback | null = null;

  constructor(sendPing: PingSender) {
    this.sendPing = sendPing;
  }

  /**
   * Start syncing with a peer
   */
  startSync(peerId: string): void {
    if (!this.clockSync.has(peerId)) {
      this.clockSync.set(peerId, new ClockSync());
      this.pingSeq.set(peerId, 0);
    }

    this.schedulePing(peerId);
  }

  /**
   * Stop syncing with a peer
   */
  stopSync(peerId: string): void {
    const timerId = this.pingTimers.get(peerId);
    if (timerId) {
      clearTimeout(timerId);
      this.pingTimers.delete(peerId);
    }

    this.clockSync.delete(peerId);
    this.pingSeq.delete(peerId);
  }

  /**
   * Schedule next ping
   */
  private schedulePing(peerId: string): void {
    const timerId = window.setTimeout(() => {
      this.sendPingToPeer(peerId);
      this.schedulePing(peerId); // Schedule next ping
    }, PING_INTERVAL_MS);

    this.pingTimers.set(peerId, timerId);
  }

  /**
   * Send ping to peer
   */
  private sendPingToPeer(peerId: string): void {
    const seq = this.pingSeq.get(peerId) ?? 0;
    this.pingSeq.set(peerId, seq + 1);

    const payload: TimePingPayload = {
      seq,
      t1LeaderMs: performance.now()
    };

    this.sendPing(payload);
  }

  /**
   * Handle pong response from peer
   */
  handlePong(peerId: string, pong: TimePongPayload): void {
    const sync = this.clockSync.get(peerId);
    if (!sync) {
      return;
    }

    const t4 = performance.now();

    const stats = sync.processPong(pong.t1LeaderMs, pong.t2PeerMs, pong.t3PeerMs, t4);

    // Notify stats update
    if (this.onStatsUpdate) {
      this.onStatsUpdate(stats);
    }
  }

  /**
   * Get clock sync for a peer
   */
  getClockSync(peerId: string): ClockSync | null {
    return this.clockSync.get(peerId) ?? null;
  }

  /**
   * Register callback for stats updates
   */
  onStats(callback: StatsCallback): void {
    this.onStatsUpdate = callback;
  }
}

/**
 * Sync engine for peer side (responds to pings)
 */
export class PeerSyncEngine {
  private clockSync: ClockSync;
  private pongSender: (payload: TimePongPayload) => void;

  constructor(pongSender: (payload: TimePongPayload) => void) {
    this.clockSync = new ClockSync();
    this.pongSender = pongSender;
  }

  /**
   * Handle ping from leader (respond immediately)
   */
  handlePing(pingPayload: TimePingPayload): void {
    const t2 = performance.now(); // Receive time
    const t3 = performance.now(); // Send time (minimize gap)

    const pong: TimePongPayload = {
      seq: pingPayload.seq,
      t1LeaderMs: pingPayload.t1LeaderMs,
      t2PeerMs: t2,
      t3PeerMs: t3
    };

    // Send pong immediately
    this.pongSender(pong);
  }

  /**
   * Get clock sync instance
   */
  getClockSync(): ClockSync {
    return this.clockSync;
  }
}
