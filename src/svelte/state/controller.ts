import { LeaderStateMachine } from '../../state/leader-machine.js';
import { PeerStateMachine } from '../../state/peer-machine.js';
import { generatePeerId } from '../../types.js';
import { flashBeat } from '../../ui/dom.js';
import { BPM_UPDATE_DEBOUNCE_MS } from '../../ui/app-shell-constants.js';
import type { TransportRuntime } from '../../realtime/runtime.js';
import type { Mode } from '../../ui/app-shell-constants.js';

const JOIN_HOST_TIMEOUT_MS = 7000;

export type BackendState = 'idle' | 'connecting' | 'ok' | 'error';

export interface WorkflowCallbacks {
  getActiveTab(): Mode;
  getCurrentBpm(): number;
  getJoinCode(): string;

  getLeader(): LeaderStateMachine | null;
  setLeader(leader: LeaderStateMachine | null): void;

  getPeer(): PeerStateMachine | null;
  setPeer(peer: PeerStateMachine | null): void;

  setHostRunning(running: boolean): void;
  setHostStatus(status: string): void;
  setJoinStatus(status: string): void;
  setJoinLiveStatus(status: string): void;
  setJoinBpm(bpm: number): void;

  setJoinInProgress(inProgress: boolean): void;
  setJoinInputDisabled(disabled: boolean): void;

  setBackendStatus(state: BackendState, detail?: string): void;

  loadStoredHostRoomCode(): string | null;
  setHostRoomCode(code: string | null): void;
  showHostTemporaryStatus(text: string): void;
  applyHostBpm(value: number): void;
  errorText(error: unknown): string;

  showJoinEntry(): void;
  showJoinLive(): void;
  enableJoinCodeReplaceOnNextEntry(): void;

  getHostBeatEl(): HTMLDivElement | null;
  getJoinBeatEl(): HTMLDivElement | null;

  focusJoinInput(): void;
}

export class AppWorkflowController {
  private joinBpmTimer: number | null = null;
  private joinHostTimeoutId: number | null = null;
  private hostStatusTimer: number | null = null;
  private bpmHoldIntervalId: number | null = null;
  private bpmHoldStartTimeoutId: number | null = null;
  private bpmUpdateDebounceTimeoutId: number | null = null;
  private suppressPointerClickUntil = 0;

  constructor(
    private readonly transportRuntime: TransportRuntime,
    private readonly cb: WorkflowCallbacks
  ) {}

  clearJoinTimer(): void {
    if (this.joinBpmTimer !== null) {
      clearInterval(this.joinBpmTimer);
      this.joinBpmTimer = null;
    }
  }

  clearJoinHostTimeout(): void {
    if (this.joinHostTimeoutId !== null) {
      clearTimeout(this.joinHostTimeoutId);
      this.joinHostTimeoutId = null;
    }
  }

  stopHostStatusTimer(): void {
    if (this.hostStatusTimer !== null) {
      clearInterval(this.hostStatusTimer);
      this.hostStatusTimer = null;
    }
  }

  refreshHostStatus(): void {
    const leader = this.cb.getLeader();
    const peers = leader ? leader.getPeerCount() : 0;
    this.cb.setHostStatus(`Connected peers: ${peers}`);
  }

  startHostStatusTimer(): void {
    this.stopHostStatusTimer();
    this.refreshHostStatus();
    this.hostStatusTimer = window.setInterval(() => {
      this.refreshHostStatus();
    }, 500);
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
    this.suppressPointerClickUntil = Date.now() + 300;
    this.applyBpmDelta(delta);

    this.stopBpmHold();
    this.bpmHoldStartTimeoutId = window.setTimeout(() => {
      this.bpmHoldIntervalId = window.setInterval(() => {
        this.applyBpmDelta(delta);
      }, 70);
    }, 300);
  }

  onBpmClick(delta: number, event: MouseEvent): void {
    if (!this.cb.getLeader()) {
      return;
    }

    if (event.detail > 0 && Date.now() < this.suppressPointerClickUntil) {
      return;
    }

    this.applyBpmDelta(delta);
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

    if (this.bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(this.bpmUpdateDebounceTimeoutId);
      this.bpmUpdateDebounceTimeoutId = null;
    }

    leader.stopMetronome();
    await leader.closeRoom();
    this.cb.setLeader(null);
    this.cb.setHostRunning(false);
    this.cb.setHostRoomCode(null);
    this.stopHostStatusTimer();
    this.refreshHostStatus();
    this.cb.setBackendStatus('idle');
  }

  async teardownPeer(): Promise<void> {
    const peer = this.cb.getPeer();
    if (!peer) {
      return;
    }

    await peer.leaveRoom();
    this.cb.setPeer(null);
    this.clearJoinTimer();
    this.cb.showJoinEntry();
    this.cb.setJoinStatus('Enter a room code to join.');
    this.cb.setBackendStatus('idle');
  }

  async switchToHost(): Promise<void> {
    await this.teardownPeer();
    await this.ensureHostRoom();
  }

  async switchToJoin(): Promise<void> {
    await this.teardownHost();
    this.cb.setJoinStatus('Enter a room code to join.');
    this.cb.enableJoinCodeReplaceOnNextEntry();
    this.cb.showJoinEntry();
    this.cb.focusJoinInput();
  }

  async joinRoom(roomId: string): Promise<void> {
    await this.teardownPeer();
    this.cb.setJoinStatus('Joining room...');
    this.cb.setBackendStatus('connecting');
    this.clearJoinHostTimeout();
    this.cb.setJoinInProgress(true);
    this.cb.setJoinInputDisabled(true);

    const peer = new PeerStateMachine(generatePeerId(), this.transportRuntime);
    peer.getMetronome().onBeatScheduled((_, isDownbeat) => {
      const node = this.cb.getJoinBeatEl();
      if (node) {
        flashBeat(node, isDownbeat);
      }
    });

    peer.onStart(() => {
      this.clearJoinHostTimeout();
      this.cb.showJoinLive();
      this.cb.setJoinLiveStatus('Running.');

      this.cb.setJoinBpm(peer.getMetronome().getBPM());
      this.clearJoinTimer();
      this.joinBpmTimer = window.setInterval(() => {
        if (this.cb.getPeer()) {
          this.cb.setJoinBpm(peer.getMetronome().getBPM());
        }
      }, 300);
    });

    peer.onSyncStatus((status) => {
      this.clearJoinHostTimeout();
      this.cb.setBackendStatus('ok');
      this.cb.showJoinLive();
      this.cb.setJoinLiveStatus(status);
    });

    await peer.joinRoom(roomId);
    this.cb.setPeer(peer);
    this.cb.setJoinStatus('Waiting for host...');
    this.joinHostTimeoutId = window.setTimeout(() => {
      const currentPeer = this.cb.getPeer();
      if (!currentPeer) {
        return;
      }

      const state = currentPeer.getState();
      if (state === 'C_DISCOVERING' || state === 'C_SIGNALING') {
        this.teardownPeer()
          .then(() => {
            this.cb.setJoinStatus('Host not found. Try another code.');
            this.cb.enableJoinCodeReplaceOnNextEntry();
            this.cb.setBackendStatus('error', 'No host responded for this room code');
          })
          .catch((error) => {
            console.error(error);
            this.cb.setJoinStatus('Host not found. Try another code.');
            this.cb.enableJoinCodeReplaceOnNextEntry();
            this.cb.setBackendStatus('error', this.cb.errorText(error));
          });
      }
    }, JOIN_HOST_TIMEOUT_MS);

    this.cb.setJoinInProgress(false);
  }

  maybeAutoJoin(): void {
    const code = this.cb.getJoinCode();
    if (code.length !== 6 || this.cb.getPeer()) {
      return;
    }

    this.joinRoom(code).catch((error) => {
      console.error(error);
      this.cb.setJoinInProgress(false);
      this.cb.setJoinInputDisabled(false);
      this.cb.setJoinStatus('Join failed. Try another code.');
      this.cb.enableJoinCodeReplaceOnNextEntry();
      this.cb.showJoinEntry();
      this.cb.setBackendStatus('error', this.cb.errorText(error));
    });
  }

  startHostMetronome(): void {
    const leader = this.cb.getLeader();
    if (!leader) {
      return;
    }

    if (this.bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(this.bpmUpdateDebounceTimeoutId);
      this.bpmUpdateDebounceTimeoutId = null;
      leader.setBPM(this.cb.getCurrentBpm());
    }

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

  queueRunningBpmUpdate(apply: () => void): void {
    if (this.bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(this.bpmUpdateDebounceTimeoutId);
    }

    this.bpmUpdateDebounceTimeoutId = window.setTimeout(() => {
      this.bpmUpdateDebounceTimeoutId = null;
      apply();
    }, BPM_UPDATE_DEBOUNCE_MS);
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

    void this.teardownPeer();
    void this.teardownHost();
  }
}
