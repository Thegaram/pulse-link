/**
 * Statistical utilities for time synchronization
 * RTT median filtering and exponential moving average
 */

const RTT_WINDOW_SIZE = 10;
const EMA_ALPHA = 0.3; // Smoothing factor for exponential moving average

/**
 * Sliding window for RTT samples
 */
export class RTTWindow {
  private samples: number[] = [];
  private maxSize: number;

  constructor(maxSize: number = RTT_WINDOW_SIZE) {
    this.maxSize = maxSize;
  }

  /**
   * Add RTT sample to window
   */
  add(rtt: number): void {
    this.samples.push(rtt);

    // Keep only last N samples
    if (this.samples.length > this.maxSize) {
      this.samples.shift();
    }
  }

  /**
   * Get median RTT (more robust than minimum)
   */
  getMedian(): number | null {
    if (this.samples.length === 0) {
      return null;
    }

    const sorted = [...this.samples].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);

    if (sorted.length % 2 === 0) {
      return (sorted[mid - 1] + sorted[mid]) / 2;
    } else {
      return sorted[mid];
    }
  }

  /**
   * Get minimum RTT (best sample)
   */
  getMin(): number | null {
    if (this.samples.length === 0) {
      return null;
    }

    return Math.min(...this.samples);
  }

  /**
   * Get number of samples in window
   */
  size(): number {
    return this.samples.length;
  }

  /**
   * Clear all samples
   */
  clear(): void {
    this.samples = [];
  }
}

/**
 * Exponential moving average filter
 */
export class EMAFilter {
  private value: number | null = null;
  private alpha: number;

  constructor(alpha: number = EMA_ALPHA) {
    this.alpha = alpha;
  }

  /**
   * Update with new value
   */
  update(newValue: number): number {
    if (this.value === null) {
      this.value = newValue;
    } else {
      this.value = this.alpha * newValue + (1 - this.alpha) * this.value;
    }

    return this.value;
  }

  /**
   * Get current filtered value
   */
  getValue(): number | null {
    return this.value;
  }

  /**
   * Reset filter
   */
  reset(): void {
    this.value = null;
  }
}
