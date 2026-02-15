/**
 * Audio buffer generation for metronome clicks
 * Generates distinct sounds for downbeats (accent) and regular beats
 */

const SAMPLE_RATE = 44100;
const CLICK_DURATION_MS = 50;
const CLICK_DURATION_SAMPLES = Math.floor((CLICK_DURATION_MS / 1000) * SAMPLE_RATE);

/**
 * Generate a click sound buffer using a sine wave with envelope
 * @param context - AudioContext for buffer creation
 * @param frequency - Frequency in Hz (higher = brighter sound)
 * @param accent - Whether this is an accented beat
 */
export function generateClickBuffer(
  context: AudioContext,
  frequency: number,
  accent: boolean = false
): AudioBuffer {
  const buffer = context.createBuffer(1, CLICK_DURATION_SAMPLES, SAMPLE_RATE);
  const data = buffer.getChannelData(0);

  const amplitude = accent ? 0.8 : 0.5;

  for (let i = 0; i < CLICK_DURATION_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;

    // Sine wave
    const sineWave = Math.sin(2 * Math.PI * frequency * t);

    // Exponential decay envelope for percussive sound
    const envelope = Math.exp(-10 * t);

    data[i] = sineWave * envelope * amplitude;
  }

  return buffer;
}

/**
 * Click sound cache to avoid regenerating buffers
 */
export class ClickSoundCache {
  private regularClick: AudioBuffer | null = null;
  private accentClick: AudioBuffer | null = null;

  private readonly REGULAR_FREQ = 800; // Hz
  private readonly ACCENT_FREQ = 1200; // Hz (higher pitch for downbeat)

  /**
   * Get regular beat click buffer
   */
  getRegularClick(context: AudioContext): AudioBuffer {
    if (!this.regularClick) {
      this.regularClick = generateClickBuffer(context, this.REGULAR_FREQ, false);
    }
    return this.regularClick;
  }

  /**
   * Get accented beat click buffer (for downbeats)
   */
  getAccentClick(context: AudioContext): AudioBuffer {
    if (!this.accentClick) {
      this.accentClick = generateClickBuffer(context, this.ACCENT_FREQ, true);
    }
    return this.accentClick;
  }

  /**
   * Clear cached buffers (e.g., when context changes)
   */
  clear(): void {
    this.regularClick = null;
    this.accentClick = null;
  }
}

// Singleton instance
export const clickSoundCache = new ClickSoundCache();
