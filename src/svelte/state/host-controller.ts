import { LeaderStateMachine } from '../../state/leader-machine.js';
import { generatePeerId } from '../../types.js';
import { flashBeat } from '../../ui/dom.js';
import type { TransportRuntime } from '../../realtime/runtime.js';
import type { WorkflowCallbacks } from './workflow-types.js';
import { TimerLifecycle } from './timer-lifecycle.js';

export class HostController {
  constructor(
    private readonly transportRuntime: TransportRuntime,
    private readonly cb: WorkflowCallbacks,
    private readonly timers: TimerLifecycle
  ) {}

  private refreshHostStatus(): void {
    const leader = this.cb.getLeader();
    this.cb.setHostPeerCount(leader ? leader.getPeerCount() : 0);
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
    const roomId = await leader.createRoom(this.cb.getCurrentBpm(), preferredRoomId ?? undefined);

    this.cb.setLeader(leader);
    this.cb.setHostRoomCode(roomId);
    this.cb.setHostRunning(false);
    this.cb.setBackendStatus('ok');
    this.startHostStatusTimer();
  }

  async regenerateHostRoom(): Promise<void> {
    if (this.cb.getActiveTab() !== 'host') {
      return;
    }

    if (this.cb.getLeader()) {
      await this.teardownHost();
    }

    this.cb.applyHostBpm(120);
    await this.ensureHostRoom(true);
    this.cb.showHostTemporaryStatus('New room code generated');
  }

  async teardownHost(): Promise<void> {
    const leader = this.cb.getLeader();
    if (!leader) {
      return;
    }

    this.timers.flushRunningBpmUpdate(() => {
      leader.setBPM(this.cb.getCurrentBpm());
    });

    leader.stopMetronome();
    await leader.closeRoom();
    this.cb.setLeader(null);
    this.cb.setHostRunning(false);
    this.cb.setHostRoomCode(null);
    this.timers.stopHostStatusTimer();
    this.cb.setHostPeerCount(0);
    this.cb.setBackendStatus('idle');
  }

  startHostMetronome(): void {
    const leader = this.cb.getLeader();
    if (!leader) {
      return;
    }

    this.timers.flushRunningBpmUpdate(() => {
      leader.setBPM(this.cb.getCurrentBpm());
    });

    leader.startMetronome();
    this.cb.setHostRunning(true);
  }

  stopHostMetronome(): void {
    const leader = this.cb.getLeader();
    if (!leader) {
      return;
    }

    leader.stopMetronome();
    this.cb.setHostRunning(false);
  }
}

