/**
 * Metronome engine with Web Audio API lookahead scheduler
 *
 * Key features:
 * - 500ms lookahead to ensure clicks are scheduled ahead of playback
 * - 50ms refill interval for smooth scheduling
 * - Downbeat accents every 4 beats
 * - Sub-millisecond precision using performance.now()
 */

import { audioContextManager } from './context-manager.js';
import { clickSoundCache } from './click-generator.js';

const LOOKAHEAD_MS = 500;
const REFILL_INTERVAL_MS = 50;
const BEATS_PER_MEASURE = 4;

export interface BeatGrid {
  bpm: number;
  anchorPerformanceMs: number; // Timestamp in performance.now() time
  beatIndexAtAnchor: number;   // Absolute beat number at anchor
}

export class Metronome {
  private bpm: number = 120;
  private isRunning: boolean = false;
  private schedulerIntervalId: number | null = null;

  private beatGrid: BeatGrid | null = null;
  private nextBeatIndex: number = 0;
  private nextScheduleTimeMs: number = 0;

  constructor() {}

  /**
   * Set the beat grid and anchor point for synchronization
   * This is the key method for synchronized playback across devices
   */
  setBeatGrid(grid: BeatGrid): void {
    this.beatGrid = grid;
    this.bpm = grid.bpm;

    // Calculate the next beat to schedule based on current time
    const now = performance.now();
    const msPerBeat = 60000 / this.bpm;
    const elapsedMs = now - grid.anchorPerformanceMs;
    const elapsedBeats = elapsedMs / msPerBeat;

    // Start from next beat after current time
    this.nextBeatIndex = grid.beatIndexAtAnchor + Math.ceil(elapsedBeats);
    this.nextScheduleTimeMs = now;
  }

  /**
   * Start the metronome with simple BPM (for local playback)
   */
  start(bpm: number): void {
    if (this.isRunning) {
      return;
    }

    this.bpm = bpm;
    this.isRunning = true;

    // Create a simple beat grid starting now
    const now = performance.now();
    this.setBeatGrid({
      bpm,
      anchorPerformanceMs: now,
      beatIndexAtAnchor: 0
    });

    // Resume audio context (required for user interaction)
    audioContextManager.resume().then(() => {
      this.startScheduler();
    });
  }

  /**
   * Stop the metronome and clear scheduled clicks
   */
  stop(): void {
    this.isRunning = false;

    if (this.schedulerIntervalId !== null) {
      clearInterval(this.schedulerIntervalId);
      this.schedulerIntervalId = null;
    }
  }

  /**
   * Update BPM (for future: smooth tempo changes)
   */
  setBPM(bpm: number): void {
    if (this.bpm === bpm) {
      return;
    }

    // For V1, simple update (no smooth transition)
    this.bpm = bpm;

    if (this.beatGrid) {
      this.beatGrid.bpm = bpm;
    }
  }

  /**
   * Check if metronome is running
   */
  running(): boolean {
    return this.isRunning;
  }

  /**
   * Get current BPM
   */
  getBPM(): number {
    return this.bpm;
  }

  /**
   * Start the lookahead scheduler
   * Runs every 50ms and schedules clicks 500ms ahead
   */
  private startScheduler(): void {
    // Schedule ahead immediately
    this.scheduleAhead();

    // Then schedule at regular intervals
    this.schedulerIntervalId = window.setInterval(() => {
      if (this.isRunning) {
        this.scheduleAhead();
      }
    }, REFILL_INTERVAL_MS);
  }

  /**
   * Schedule all clicks within the lookahead window
   */
  private scheduleAhead(): void {
    if (!this.beatGrid) {
      return;
    }

    const context = audioContextManager.getContext();
    const now = performance.now();
    const contextTime = context.currentTime;
    const lookaheadTargetMs = now + LOOKAHEAD_MS;

    // Schedule all beats from now until lookahead window
    while (this.nextScheduleTimeMs < lookaheadTargetMs) {
      const beatTimeMs = this.calculateBeatTime(this.nextBeatIndex);

      // Convert performance.now() time to AudioContext time
      const beatContextTime = this.performanceToAudioContext(beatTimeMs, now, contextTime);

      // Only schedule if in future
      if (beatContextTime > contextTime) {
        this.scheduleClick(beatContextTime, this.nextBeatIndex);
      }

      this.nextBeatIndex++;
      this.nextScheduleTimeMs = beatTimeMs;
    }
  }

  /**
   * Calculate the performance.now() timestamp for a given beat index
   */
  private calculateBeatTime(beatIndex: number): number {
    if (!this.beatGrid) {
      return 0;
    }

    const msPerBeat = 60000 / this.beatGrid.bpm;
    const beatOffset = beatIndex - this.beatGrid.beatIndexAtAnchor;
    return this.beatGrid.anchorPerformanceMs + (beatOffset * msPerBeat);
  }

  /**
   * Convert performance.now() timestamp to AudioContext time
   */
  private performanceToAudioContext(
    performanceMs: number,
    nowPerformance: number,
    nowContext: number
  ): number {
    const deltaMs = performanceMs - nowPerformance;
    return nowContext + (deltaMs / 1000);
  }

  /**
   * Schedule a single click in the Web Audio API
   */
  private scheduleClick(audioContextTime: number, beatIndex: number): void {
    const context = audioContextManager.getContext();

    // Determine if this is a downbeat (every 4th beat)
    const isDownbeat = (beatIndex % BEATS_PER_MEASURE) === 0;

    // Get appropriate click sound
    const buffer = isDownbeat
      ? clickSoundCache.getAccentClick(context)
      : clickSoundCache.getRegularClick(context);

    // Create audio graph: buffer source -> gain -> destination
    const source = context.createBufferSource();
    source.buffer = buffer;

    const gainNode = context.createGain();
    gainNode.gain.value = 1.0;

    source.connect(gainNode);
    gainNode.connect(context.destination);

    // Schedule playback
    source.start(audioContextTime);
  }
}
