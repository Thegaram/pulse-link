/**
 * Clock offset estimation using ping/pong protocol
 *
 * Algorithm:
 * Leader sends ping at t1
 * Peer receives at t2, sends pong immediately at t3
 * Leader receives pong at t4
 *
 * RTT = (t4 - t1) - (t3 - t2)
 * Offset = ((t2 - t1) + (t3 - t4)) / 2
 *
 * Uses median RTT filtering to reject outliers
 */

import { RTTWindow, EMAFilter } from './stats.js';

export interface ClockStats {
  offsetMs: number;
  rtt: number;
  samples: number;
  stable: boolean;
}

const MIN_SAMPLES_FOR_STABILITY = 5;

export class ClockSync {
  private rttWindow: RTTWindow;
  private offsetFilter: EMAFilter;
  private currentOffsetMs: number = 0;
  private lastRTT: number = 0;

  constructor() {
    this.rttWindow = new RTTWindow();
    this.offsetFilter = new EMAFilter();
  }

  /**
   * Process pong response and update offset estimate
   *
   * @param t1LeaderMs - Leader send time (from ping)
   * @param t2PeerMs - Peer receive time
   * @param t3PeerMs - Peer send time (pong)
   * @param t4LeaderMs - Leader receive time (now)
   * @returns Updated clock stats
   */
  processPong(
    t1LeaderMs: number,
    t2PeerMs: number,
    t3PeerMs: number,
    t4LeaderMs: number
  ): ClockStats {
    // Calculate RTT
    const rtt = t4LeaderMs - t1LeaderMs - (t3PeerMs - t2PeerMs);

    // Add to window
    this.rttWindow.add(rtt);
    this.lastRTT = rtt;

    // Calculate raw offset
    const rawOffset = (t2PeerMs - t1LeaderMs + (t3PeerMs - t4LeaderMs)) / 2;

    // Get median RTT for filtering
    const medianRTT = this.rttWindow.getMedian();

    // Only update offset on good samples (RTT close to median)
    if (medianRTT !== null && rtt <= medianRTT * 1.5) {
      // Apply EMA smoothing
      this.currentOffsetMs = this.offsetFilter.update(rawOffset);
    }

    return this.getStats();
  }

  /**
   * Get current clock offset (peer time = leader time + offset)
   */
  getOffsetMs(): number {
    return this.currentOffsetMs;
  }

  /**
   * Set offset from an authoritative source (for example, leader-calculated value).
   */
  setOffsetMs(offsetMs: number): void {
    this.currentOffsetMs = this.offsetFilter.update(offsetMs);
  }

  /**
   * Convert leader timestamp to peer timestamp
   */
  leaderToPeerTime(leaderMs: number): number {
    return leaderMs + this.currentOffsetMs;
  }

  /**
   * Convert peer timestamp to leader timestamp
   */
  peerToLeaderTime(peerMs: number): number {
    return peerMs - this.currentOffsetMs;
  }

  /**
   * Get current synchronization statistics
   */
  getStats(): ClockStats {
    const samples = this.rttWindow.size();
    const medianRTT = this.rttWindow.getMedian() ?? this.lastRTT;

    // Consider stable if:
    // 1. Have enough samples
    // 2. Offset variation is low (filtered value exists and is close to raw)
    const stable = samples >= MIN_SAMPLES_FOR_STABILITY;

    return {
      offsetMs: this.currentOffsetMs,
      rtt: medianRTT,
      samples,
      stable
    };
  }

  /**
   * Reset synchronization state
   */
  reset(): void {
    this.rttWindow.clear();
    this.offsetFilter.reset();
    this.currentOffsetMs = 0;
    this.lastRTT = 0;
  }
}
