/**
 * AudioContext lifecycle management
 * Handles creation, resumption, and cleanup of Web Audio API context
 */

export class AudioContextManager {
  private context: AudioContext | null = null;

  /**
   * Get or create the AudioContext singleton
   * Must be called after user interaction to avoid browser autoplay restrictions
   */
  getContext(): AudioContext {
    if (!this.context) {
      this.context = new AudioContext();
    }

    // Resume context if suspended (common after page load)
    if (this.context.state === 'suspended') {
      this.context.resume();
    }

    return this.context;
  }

  /**
   * Ensure context is running (for user interaction handlers)
   */
  async resume(): Promise<void> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }
  }

  /**
   * Close the audio context and release resources
   */
  async close(): Promise<void> {
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  /**
   * Get current audio context time (for scheduling)
   */
  getCurrentTime(): number {
    return this.getContext().currentTime;
  }

  /**
   * Check if context is ready
   */
  isReady(): boolean {
    return this.context !== null && this.context.state === 'running';
  }
}

// Singleton instance
export const audioContextManager = new AudioContextManager();
