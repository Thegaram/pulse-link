import { BPM_UPDATE_DEBOUNCE_MS } from '../../ui/app-shell-constants.js';

export class TimerLifecycle {
  private joinBpmTimer: number | null = null;
  private joinHostTimeoutId: number | null = null;
  private hostStatusTimer: number | null = null;
  private bpmHoldIntervalId: number | null = null;
  private bpmHoldStartTimeoutId: number | null = null;
  private bpmUpdateDebounceTimeoutId: number | null = null;
  private suppressPointerClickUntil = 0;

  clearJoinTimer(): void {
    if (this.joinBpmTimer !== null) {
      clearInterval(this.joinBpmTimer);
      this.joinBpmTimer = null;
    }
  }

  setJoinTimer(task: () => void, intervalMs: number): void {
    this.clearJoinTimer();
    this.joinBpmTimer = window.setInterval(task, intervalMs);
  }

  clearJoinHostTimeout(): void {
    if (this.joinHostTimeoutId !== null) {
      clearTimeout(this.joinHostTimeoutId);
      this.joinHostTimeoutId = null;
    }
  }

  setJoinHostTimeout(task: () => void, timeoutMs: number): void {
    this.clearJoinHostTimeout();
    this.joinHostTimeoutId = window.setTimeout(task, timeoutMs);
  }

  stopHostStatusTimer(): void {
    if (this.hostStatusTimer !== null) {
      clearInterval(this.hostStatusTimer);
      this.hostStatusTimer = null;
    }
  }

  startHostStatusTimer(task: () => void, intervalMs: number): void {
    this.stopHostStatusTimer();
    task();
    this.hostStatusTimer = window.setInterval(task, intervalMs);
  }

  stopBpmHold(): void {
    if (this.bpmHoldStartTimeoutId !== null) {
      clearTimeout(this.bpmHoldStartTimeoutId);
      this.bpmHoldStartTimeoutId = null;
    }

    if (this.bpmHoldIntervalId !== null) {
      clearInterval(this.bpmHoldIntervalId);
      this.bpmHoldIntervalId = null;
    }
  }

  startBpmHold(applyDelta: () => void): void {
    this.suppressPointerClickUntil = Date.now() + 300;
    applyDelta();

    this.stopBpmHold();
    this.bpmHoldStartTimeoutId = window.setTimeout(() => {
      this.bpmHoldIntervalId = window.setInterval(() => {
        applyDelta();
      }, 70);
    }, 300);
  }

  shouldSuppressPointerClick(eventDetail: number): boolean {
    return eventDetail > 0 && Date.now() < this.suppressPointerClickUntil;
  }

  queueRunningBpmUpdate(apply: () => void): void {
    if (this.bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(this.bpmUpdateDebounceTimeoutId);
    }

    this.bpmUpdateDebounceTimeoutId = window.setTimeout(() => {
      this.bpmUpdateDebounceTimeoutId = null;
      apply();
    }, BPM_UPDATE_DEBOUNCE_MS);
  }

  flushRunningBpmUpdate(flush: () => void): void {
    if (this.bpmUpdateDebounceTimeoutId === null) {
      return;
    }

    clearTimeout(this.bpmUpdateDebounceTimeoutId);
    this.bpmUpdateDebounceTimeoutId = null;
    flush();
  }

  destroy(): void {
    this.stopBpmHold();
    this.clearJoinTimer();
    this.clearJoinHostTimeout();
    this.stopHostStatusTimer();

    if (this.bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(this.bpmUpdateDebounceTimeoutId);
      this.bpmUpdateDebounceTimeoutId = null;
    }
  }
}

