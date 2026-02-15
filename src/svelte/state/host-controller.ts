import { LeaderStateMachine } from '../../state/leader-machine.js';
import { generatePeerId } from '../../types.js';
import { flashBeat } from '../services/beat-visual.js';
import type { TransportRuntime } from '../../realtime/runtime.js';
import type { ControllerCallbacks } from './controller-types.js';
import { TimerLifecycle } from './timer-lifecycle.js';

export class HostController {
  private pendingResume: { anchorEpochMs: number; beatIndexAtAnchor: number } | null = null;

  constructor(
    private readonly transportRuntime: TransportRuntime,
    private readonly cb: ControllerCallbacks,
    private readonly timers: TimerLifecycle
  ) {}

  private refreshHostStatus(): void {
    const leader = this.cb.getLeader();
    this.cb.setHostPeerCount(leader ? leader.getPeerCount() : 0);
    this.persistHostSession();
  }

  private setPendingResume(
    next: { anchorEpochMs: number; beatIndexAtAnchor: number } | null
  ): void {
    this.pendingResume = next;
    this.cb.setHostPendingResume(Boolean(next));
  }

  private startHostStatusTimer(): void {
    this.timers.startHostStatusTimer(() => {
      this.refreshHostStatus();
    }, 500);
  }

  private applyBpmDelta(delta: number): void {
    if (!this.cb.getLeader()) {
      return;
    }
    this.cb.applyHostBpm(this.cb.getCurrentBpm() + delta);
  }

  private resetHostBeatVisual(): void {
    const node = this.cb.getHostBeatEl();
    if (!node) {
      return;
    }

    node.classList.remove('flash', 'downbeat');
  }

  onBpmPointerDown(delta: number, event: PointerEvent): void {
    if (!this.cb.getLeader() || event.button !== 0) {
      return;
    }

    event.preventDefault();
    this.timers.startBpmHold(() => {
      this.applyBpmDelta(delta);
    });
  }

  onBpmClick(delta: number, event: MouseEvent): void {
    if (!this.cb.getLeader()) {
      return;
    }

    if (this.timers.shouldSuppressPointerClick(event.detail)) {
      return;
    }

    this.applyBpmDelta(delta);
  }

  stopBpmHold(): void {
    this.timers.stopBpmHold();
  }

  queueRunningBpmUpdate(apply: () => void): void {
    this.timers.queueRunningBpmUpdate(apply);
  }

  syncHostSessionNow(): void {
    this.persistHostSession();
  }

  async ensureHostRoom(forceNewCode = false): Promise<void> {
    if (this.cb.getLeader()) {
      this.cb.setBackendStatus('ok');
      return;
    }

    this.cb.setBackendStatus('connecting');
    const leader = new LeaderStateMachine(generatePeerId(), this.transportRuntime);
    leader.getMetronome().onBeatScheduled((_, isDownbeat) => {
      const node = this.cb.getHostBeatEl();
      if (node) {
        flashBeat(node, isDownbeat);
      }
    });

    const preferredRoomId = forceNewCode ? undefined : this.cb.loadStoredHostRoomCode();
    const persistedSession = preferredRoomId
      ? this.cb.loadPersistedHostSession(preferredRoomId)
      : null;
    const initialBpm = persistedSession?.bpm ?? this.cb.getCurrentBpm();
    this.cb.applyHostBpm(initialBpm);

    const roomId = await leader.createRoom(initialBpm, preferredRoomId ?? undefined);

    this.cb.setLeader(leader);
    this.cb.setHostRoomCode(roomId);
    this.cb.setHostRunning(false);
    this.setPendingResume(null);

    if (
      persistedSession?.running &&
      persistedSession.anchorEpochMs !== undefined &&
      persistedSession.beatIndexAtAnchor !== undefined
    ) {
      // Keep host paused after refresh and let explicit Start resume from persisted phase.
      this.setPendingResume({
        anchorEpochMs: persistedSession.anchorEpochMs,
        beatIndexAtAnchor: persistedSession.beatIndexAtAnchor
      });
    }

    this.cb.setBackendStatus('ok');
    this.persistHostSession();
    this.startHostStatusTimer();
  }

  async regenerateHostRoom(): Promise<void> {
    if (this.cb.getActiveTab() !== 'host') {
      return;
    }

    if (this.cb.getLeader()) {
      await this.teardownHost();
    }

    this.setPendingResume(null);
    this.cb.applyHostBpm(120);
    await this.ensureHostRoom(true);
    this.cb.showHostTemporaryStatus('New room code generated');
  }

  async teardownHost(): Promise<void> {
    const leader = this.cb.getLeader();
    if (!leader) {
      return;
    }
    const roomId = leader.getRoomId() ?? '';

    this.timers.flushRunningBpmUpdate(() => {
      leader.setBPM(this.cb.getCurrentBpm());
    });

    leader.stopMetronome();
    await leader.closeRoom();
    this.cb.setLeader(null);
    this.cb.setHostRunning(false);
    this.resetHostBeatVisual();
    this.setPendingResume(null);
    this.timers.stopHostStatusTimer();
    this.cb.setHostPeerCount(0);
    this.cb.setBackendStatus('idle');
    this.persistHostSessionFromSnapshot({
      roomId,
      bpm: this.cb.getCurrentBpm(),
      running: false
    });
  }

  startHostMetronome(): void {
    const leader = this.cb.getLeader();
    if (!leader) {
      return;
    }

    this.timers.flushRunningBpmUpdate(() => {
      leader.setBPM(this.cb.getCurrentBpm());
    });

    if (this.pendingResume) {
      const anchorLeaderMs = performance.now() + (this.pendingResume.anchorEpochMs - Date.now());
      leader.resumeMetronomeFromAnchor(anchorLeaderMs, this.pendingResume.beatIndexAtAnchor);
      this.setPendingResume(null);
    } else {
      leader.startMetronome();
    }

    this.cb.setHostRunning(true);
    this.persistHostSession();
  }

  stopHostMetronome(): void {
    const leader = this.cb.getLeader();
    if (!leader) {
      return;
    }

    leader.stopMetronome();
    this.cb.setHostRunning(false);
    this.resetHostBeatVisual();
    this.setPendingResume(null);
    this.persistHostSession();
  }

  private persistHostSessionFromSnapshot(snapshot: {
    roomId: string;
    bpm: number;
    running: boolean;
    anchorLeaderMs?: number;
    beatIndexAtAnchor?: number;
  }): void {
    if (!snapshot.roomId) {
      return;
    }

    this.cb.persistHostSession({
      roomId: snapshot.roomId,
      bpm: snapshot.bpm,
      running: snapshot.running,
      anchorEpochMs:
        snapshot.running && snapshot.anchorLeaderMs !== undefined
          ? Date.now() + (snapshot.anchorLeaderMs - performance.now())
          : undefined,
      beatIndexAtAnchor: snapshot.running ? (snapshot.beatIndexAtAnchor ?? 0) : undefined
    });
  }

  private persistHostSession(): void {
    if (this.pendingResume) {
      const roomId = this.cb.getLeader()?.getRoomId();
      if (!roomId) {
        return;
      }

      this.persistHostSessionFromSnapshot({
        roomId,
        bpm: this.cb.getCurrentBpm(),
        running: true,
        anchorLeaderMs: performance.now() + (this.pendingResume.anchorEpochMs - Date.now()),
        beatIndexAtAnchor: this.pendingResume.beatIndexAtAnchor
      });
      return;
    }

    const leader = this.cb.getLeader();
    if (!leader) {
      return;
    }

    const snapshot = leader.getPersistenceSnapshot();
    if (!snapshot) {
      return;
    }

    this.persistHostSessionFromSnapshot(snapshot);
  }
}
