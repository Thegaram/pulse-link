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
  beatIndexAtAnchor: number; // Absolute beat number at anchor
}

export class Metronome {
  private bpm: number = 120;
  private isRunning: boolean = false;
  private schedulerIntervalId: number | null = null;

  private beatGrid: BeatGrid | null = null;
  private nextBeatIndex: number = 0;
  private nextScheduleTimeMs: number = 0;

  // Track scheduled audio sources so we can cancel them
  private scheduledSources: AudioBufferSourceNode[] = [];
  private scheduledVisualTimeoutIds: number[] = [];

  // Callback for visual sync (called when beat is scheduled)
  private onBeatScheduledCallback:
    | ((beatIndex: number, isDownbeat: boolean, timeMs: number) => void)
    | null = null;
  private waitingForUserGesture: boolean = false;
  private readonly onUserGesture = () => {
    if (!this.isRunning) {
      this.disarmUserGestureResume();
      return;
    }

    void audioContextManager
      .resume()
      .then(() => {
        if (!this.isRunning) {
          this.disarmUserGestureResume();
          return;
        }

        this.startSchedulerIfNeeded();
        this.disarmUserGestureResume();
      })
      .catch(() => {
        // Keep listeners armed until resume succeeds.
      });
  };

  constructor() {}

  /**
   * Set the beat grid and anchor point for synchronization
   * This is the key method for synchronized playback across devices
   */
  setBeatGrid(grid: BeatGrid): void {
    const wasRunning = this.isRunning;

    // Re-anchoring during playback must drop old lookahead clicks,
    // otherwise old/new schedules overlap and sound chaotic.
    if (wasRunning) {
      this.clearScheduledSounds();
    }

    this.beatGrid = grid;
    this.bpm = grid.bpm;
    this.resetScheduleCursor();

    if (wasRunning) {
      this.scheduleAhead();
    }
  }

  /**
   * Recompute next beat cursor from current time and active beat grid.
   */
  private resetScheduleCursor(): void {
    if (!this.beatGrid) {
      return;
    }

    const now = performance.now();
    const msPerBeat = 60000 / this.beatGrid.bpm;
    const elapsedMs = now - this.beatGrid.anchorPerformanceMs;
    const elapsedBeats = elapsedMs / msPerBeat;

    // Use floor (clamped at 0) so a fresh anchor doesn't skip beat 0.
    // Using ceil can jump directly to beat 1 when start is called just after anchor.
    const beatsSinceAnchor = Math.max(0, Math.floor(elapsedBeats));
    this.nextBeatIndex = this.beatGrid.beatIndexAtAnchor + beatsSinceAnchor;
    this.nextScheduleTimeMs = this.calculateBeatTime(this.nextBeatIndex);
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

    // If no synchronized grid was set, start from local time.
    if (!this.beatGrid) {
      const now = performance.now();
      this.setBeatGrid({
        bpm,
        anchorPerformanceMs: now,
        beatIndexAtAnchor: 0
      });
    } else if (this.beatGrid.bpm !== bpm) {
      this.beatGrid = {
        ...this.beatGrid,
        bpm
      };
      this.nextScheduleTimeMs = performance.now();
    }

    // Resume audio context (required for user interaction).
    void audioContextManager
      .resume()
      .then(() => {
        this.startSchedulerIfNeeded();
        this.disarmUserGestureResume();
      })
      .catch(() => {
        this.armUserGestureResume();
      });
  }

  /**
   * Stop the metronome and clear scheduled clicks
   */
  stop(): void {
    this.isRunning = false;
    this.disarmUserGestureResume();

    if (this.schedulerIntervalId !== null) {
      clearInterval(this.schedulerIntervalId);
      this.schedulerIntervalId = null;
    }

    // Stop all scheduled audio sources immediately
    this.clearScheduledSounds();
  }

  /**
   * Update BPM (clears schedule and restarts)
   */
  setBPM(bpm: number): void {
    if (this.bpm === bpm) {
      return;
    }

    const wasRunning = this.isRunning;

    // Stop all scheduled sounds
    this.clearScheduledSounds();

    // Update BPM
    this.bpm = bpm;

    if (wasRunning && this.beatGrid) {
      // Recalculate beat grid with new BPM from current position
      const now = performance.now();
      const msPerBeatOld = 60000 / this.beatGrid.bpm;
      const elapsedMs = now - this.beatGrid.anchorPerformanceMs;
      const currentBeatIndex =
        this.beatGrid.beatIndexAtAnchor + Math.floor(elapsedMs / msPerBeatOld);

      // Create new beat grid at current beat with new BPM
      this.beatGrid = {
        bpm,
        anchorPerformanceMs: now,
        beatIndexAtAnchor: currentBeatIndex
      };

      // Reset schedule cursor against the new grid.
      this.resetScheduleCursor();

      // Reschedule immediately
      this.scheduleAhead();
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
   * Register callback for when beats are scheduled (for visual sync)
   */
  onBeatScheduled(
    callback: (beatIndex: number, isDownbeat: boolean, timeMs: number) => void
  ): void {
    this.onBeatScheduledCallback = callback;
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

  private startSchedulerIfNeeded(): void {
    if (this.schedulerIntervalId !== null) {
      return;
    }

    this.startScheduler();
  }

  private armUserGestureResume(): void {
    if (this.waitingForUserGesture) {
      return;
    }

    this.waitingForUserGesture = true;
    window.addEventListener('pointerdown', this.onUserGesture, { passive: true });
    window.addEventListener('keydown', this.onUserGesture);
    window.addEventListener('touchstart', this.onUserGesture, { passive: true });
  }

  private disarmUserGestureResume(): void {
    if (!this.waitingForUserGesture) {
      return;
    }

    this.waitingForUserGesture = false;
    window.removeEventListener('pointerdown', this.onUserGesture);
    window.removeEventListener('keydown', this.onUserGesture);
    window.removeEventListener('touchstart', this.onUserGesture);
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
    return this.beatGrid.anchorPerformanceMs + beatOffset * msPerBeat;
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
    return nowContext + deltaMs / 1000;
  }

  /**
   * Schedule a single click in the Web Audio API
   */
  private scheduleClick(audioContextTime: number, beatIndex: number): void {
    const context = audioContextManager.getContext();

    // Determine if this is a downbeat (every 4th beat)
    const isDownbeat = beatIndex % BEATS_PER_MEASURE === 0;

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

    // Track this source so we can cancel it if needed
    this.scheduledSources.push(source);

    // Calculate when this beat will actually play (in performance.now() time)
    const now = performance.now();
    const contextNow = context.currentTime;
    const playTimeMs = now + (audioContextTime - contextNow) * 1000;

    // Schedule visual callback to trigger at the right time
    if (this.onBeatScheduledCallback) {
      const visualDelay = Math.max(0, playTimeMs - performance.now());
      const timeoutId = window.setTimeout(() => {
        const index = this.scheduledVisualTimeoutIds.indexOf(timeoutId);
        if (index > -1) {
          this.scheduledVisualTimeoutIds.splice(index, 1);
        }

        if (this.onBeatScheduledCallback) {
          this.onBeatScheduledCallback(beatIndex, isDownbeat, playTimeMs);
        }
      }, visualDelay);
      this.scheduledVisualTimeoutIds.push(timeoutId);
    }

    // Remove from tracking when it finishes playing
    source.onended = () => {
      const index = this.scheduledSources.indexOf(source);
      if (index > -1) {
        this.scheduledSources.splice(index, 1);
      }
    };

    // Schedule playback
    source.start(audioContextTime);
  }

  /**
   * Clear all scheduled sounds (called on stop or BPM change)
   */
  private clearScheduledSounds(): void {
    // Stop all scheduled sources
    for (const source of this.scheduledSources) {
      try {
        source.stop();
        source.disconnect();
      } catch {
        // Source may have already finished or been stopped
      }
    }

    // Clear the array
    this.scheduledSources = [];

    for (const timeoutId of this.scheduledVisualTimeoutIds) {
      clearTimeout(timeoutId);
    }
    this.scheduledVisualTimeoutIds = [];
  }
}
