import { LeaderStateMachine } from '../state/leader-machine.js';
import { PeerStateMachine } from '../state/peer-machine.js';
import { generatePeerId } from '../types.js';
import { IceConfig } from '../webrtc/types.js';
import { createSignalingTransport, SignalingOptions } from '../signaling/factory.js';
import { flashBeat } from './dom.js';
import { getAppShellRefs } from './app-shell-refs.js';
import { BPM_UPDATE_DEBOUNCE_MS, HOST_ROOM_STORAGE_KEY, MAX_BPM, MIN_BPM, Mode } from './app-shell-constants.js';
import { createTransportRuntime, TransportMode, TransportRuntime } from '../realtime/runtime.js';

declare const QRCode: {
  new (element: HTMLElement, options: {
    text: string;
    width: number;
    height: number;
    colorDark: string;
    colorLight: string;
  }): unknown;
};

interface AppShellConfig {
  iceConfig?: IceConfig;
  transportMode: TransportMode;
  signaling: SignalingOptions;
  appVersion: string;
}

type BackendStatusState = 'idle' | 'connecting' | 'ok' | 'error';

class AppShellController {
  private static readonly JOIN_HOST_TIMEOUT_MS = 7000;

  private leader: LeaderStateMachine | null = null;
  private peer: PeerStateMachine | null = null;

  private currentRoomId: string | null = null;
  private currentBpm = 120;
  private activeTab: Mode = 'host';

  private joinBpmTimer: number | null = null;
  private joinHostTimeoutId: number | null = null;
  private hostStatusTimer: number | null = null;
  private bpmHoldIntervalId: number | null = null;
  private bpmHoldStartTimeoutId: number | null = null;
  private bpmUpdateDebounceTimeoutId: number | null = null;

  private hostStatusOverrideUntil = 0;
  private hostStatusOverrideText = '';
  private suppressPointerClickUntil = 0;
  private joinInProgress = false;
  private clearJoinCodeOnNextEntry = false;
  private readonly refs = getAppShellRefs();

  private readonly hostTabBtn = this.refs.hostTabBtn;
  private readonly joinTabBtn = this.refs.joinTabBtn;
  private readonly hostView = this.refs.hostView;
  private readonly joinView = this.refs.joinView;

  private readonly hostShare = this.refs.hostShare;
  private readonly regenRoomBtn = this.refs.regenRoomBtn;
  private readonly openQrBtn = this.refs.openQrBtn;
  private readonly hostRoomCode = this.refs.hostRoomCode;
  private readonly hostBeat = this.refs.hostBeat;
  private readonly hostStatus = this.refs.hostStatus;
  private readonly hostBpmValue = this.refs.hostBpmValue;

  private readonly bpmDownBtn = this.refs.bpmDownBtn;
  private readonly bpmUpBtn = this.refs.bpmUpBtn;
  private readonly startBtn = this.refs.startBtn;
  private readonly stopBtn = this.refs.stopBtn;

  private readonly joinEntry = this.refs.joinEntry;
  private readonly joinLive = this.refs.joinLive;
  private readonly joinCodeLine = this.refs.joinCodeLine;
  private readonly joinCodeVisual = this.refs.joinCodeVisual;
  private readonly joinCodeInput = this.refs.joinCodeInput;
  private readonly joinStatus = this.refs.joinStatus;
  private readonly joinLiveStatus = this.refs.joinLiveStatus;
  private readonly joinBeat = this.refs.joinBeat;
  private readonly joinBpmValue = this.refs.joinBpmValue;

  private readonly qrModal = this.refs.qrModal;
  private readonly qrNode = this.refs.qrNode;
  private readonly closeQrBtn = this.refs.closeQrBtn;
  private readonly backendStatus = this.refs.backendStatus;
  private readonly backendStatusText = this.refs.backendStatusText;
  private readonly appVersion = this.refs.appVersion;
  private readonly transportRuntime: TransportRuntime;

  constructor(private readonly config: AppShellConfig) {
    this.transportRuntime = createTransportRuntime({
      mode: config.transportMode,
      iceConfig: config.iceConfig,
      createSignaling: () => createSignalingTransport(config.signaling)
    });
  }

  init(): void {
    this.bindEvents();

    this.applyHostBpm(this.currentBpm);
    this.setBackendStatus('idle');
    this.appVersion.textContent = this.config.appVersion;
    this.renderJoinCodeVisual();

    const sharedRoom = new URLSearchParams(window.location.search).get('room');
    if (sharedRoom && sharedRoom.trim().length === 6) {
      this.activateTab('join');
      this.setJoinCode(sharedRoom.trim().toUpperCase());
      this.showJoinEntry();
      this.setJoinStatus('Joining room...');
      this.maybeAutoJoin();
      return;
    }

    this.activateTab('host');
    this.ensureHostRoom().catch((error) => {
      console.error(error);
      this.hostStatus.textContent = 'Connected peers: 0';
      this.setBackendStatus('error', this.errorText(error));
    });
  }

  private backendLabel(): string {
    if (this.config.signaling.backend === 'mock') {
      return 'Local';
    }
    if (this.config.signaling.backend === 'supabase') {
      return 'Supabase';
    }
    return 'Ably';
  }

  private errorText(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Connection error';
  }

  private setBackendStatus(state: BackendStatusState, detail?: string): void {
    const label = this.backendLabel();
    this.backendStatus.classList.remove('state-idle', 'state-connecting', 'state-ok', 'state-error');
    this.backendStatus.classList.add(`state-${state}`);

    let suffix = '';
    if (state === 'connecting') {
      suffix = ' connecting';
    } else if (state === 'error') {
      suffix = ' error';
    }

    this.backendStatusText.textContent = `${label}${suffix}`;
    this.backendStatus.title = detail ?? '';
  }

  private bindEvents(): void {
    this.hostTabBtn.addEventListener('click', () => this.onHostTabClick());
    this.joinTabBtn.addEventListener('click', () => this.onJoinTabClick());

    this.hostShare.addEventListener('click', () => {
      this.copyCodeOnly().catch((error) => console.error(error));
    });

    this.regenRoomBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      this.regenerateHostRoom().catch((error) => {
        console.error(error);
        this.hostStatus.textContent = 'Connected peers: 0';
      });
    });

    this.openQrBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      this.openQrModal();
    });

    this.closeQrBtn.addEventListener('click', () => {
      this.qrModal.classList.add('hidden');
    });

    this.qrModal.addEventListener('click', (event) => {
      if (event.target === this.qrModal) {
        this.qrModal.classList.add('hidden');
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.qrModal.classList.contains('hidden')) {
        this.qrModal.classList.add('hidden');
      }
    });

    document.addEventListener('pointerup', () => this.stopBpmHold());

    this.attachBpmHold(this.bpmDownBtn, -1);
    this.attachBpmHold(this.bpmUpBtn, +1);

    this.startBtn.addEventListener('click', () => this.startHostMetronome());
    this.stopBtn.addEventListener('click', () => this.stopHostMetronome());

    this.joinCodeLine.addEventListener('click', () => {
      if (!this.joinCodeInput.disabled) {
        this.joinCodeInput.focus();
      }
    });

    this.joinCodeInput.addEventListener('input', () => {
      this.joinCodeInput.value = this.sanitizeCode(this.joinCodeInput.value);
      this.renderJoinCodeVisual();
      this.maybeAutoJoin();
    });

    this.joinCodeInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        this.maybeAutoJoin();
        return;
      }

      if (!this.clearJoinCodeOnNextEntry) {
        return;
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return;
      }

      const printable = event.key.length === 1;
      if (printable) {
        this.setJoinCode('');
        this.clearJoinCodeOnNextEntry = false;
        return;
      }

      if (event.key === 'Backspace' || event.key === 'Delete') {
        this.setJoinCode('');
        this.clearJoinCodeOnNextEntry = false;
        event.preventDefault();
      }
    });

    this.joinCodeInput.addEventListener('paste', (event) => {
      event.preventDefault();
      const pasted = (event.clipboardData?.getData('text') ?? '').toUpperCase();
      this.clearJoinCodeOnNextEntry = false;
      this.setJoinCode(pasted);
      this.maybeAutoJoin();
    });
  }

  private onHostTabClick(): void {
    if (this.activeTab === 'host') {
      return;
    }

    this.switchToHost().catch((error) => {
      console.error(error);
      this.stopHostStatusTimer();
      this.hostStatus.textContent = 'Connected peers: 0';
      this.setBackendStatus('error', this.errorText(error));
    });
  }

  private onJoinTabClick(): void {
    if (this.activeTab === 'join') {
      return;
    }

    this.switchToJoin().catch((error) => {
      console.error(error);
      this.setJoinStatus('Failed to open join mode.');
      this.setBackendStatus('error', this.errorText(error));
    });
  }

  private refreshHostStatus(): void {
    if (Date.now() < this.hostStatusOverrideUntil) {
      this.hostStatus.textContent = this.hostStatusOverrideText;
      return;
    }

    const peers = this.leader ? this.leader.getPeerCount() : 0;
    this.hostStatus.textContent = `Connected peers: ${peers}`;
  }

  private showHostTemporaryStatus(text: string, durationMs = 1200): void {
    this.hostStatusOverrideText = text;
    this.hostStatusOverrideUntil = Date.now() + durationMs;
    this.refreshHostStatus();
  }

  private stopHostStatusTimer(): void {
    if (this.hostStatusTimer !== null) {
      clearInterval(this.hostStatusTimer);
      this.hostStatusTimer = null;
    }
  }

  private startHostStatusTimer(): void {
    this.stopHostStatusTimer();
    this.refreshHostStatus();
    this.hostStatusTimer = window.setInterval(() => {
      this.refreshHostStatus();
    }, 500);
  }

  private setJoinStatus(text: string): void {
    this.joinStatus.textContent = text;
  }

  private setJoinLiveStatus(text: string): void {
    this.joinLiveStatus.textContent = text;
  }

  private getJoinCode(): string {
    return this.joinCodeInput.value;
  }

  private setJoinCode(code: string): void {
    this.joinCodeInput.value = this.sanitizeCode(code);
    this.renderJoinCodeVisual();
  }

  private setJoinInputDisabled(disabled: boolean): void {
    this.joinCodeInput.disabled = disabled;
    this.joinCodeLine.classList.toggle('disabled', disabled);
  }

  private renderJoinCodeVisual(): void {
    const chars = this.joinCodeInput.value.split('');
    const display = Array.from({ length: 6 }, (_, i) => chars[i] ?? '_').join(' ');
    this.joinCodeVisual.textContent = display;
  }

  private sanitizeCode(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  private clampBpm(value: number): number {
    return Math.max(MIN_BPM, Math.min(MAX_BPM, value));
  }

  private setHostRoomCode(code: string | null): void {
    this.currentRoomId = code;
    this.hostRoomCode.textContent = code ?? '------';

    if (code) {
      localStorage.setItem(HOST_ROOM_STORAGE_KEY, code);
    } else {
      localStorage.removeItem(HOST_ROOM_STORAGE_KEY);
    }
  }

  private loadStoredHostRoomCode(): string | null {
    const stored = localStorage.getItem(HOST_ROOM_STORAGE_KEY);
    if (!stored) {
      return null;
    }

    const normalized = stored.toUpperCase().trim();
    if (!/^[A-Z0-9]{6}$/.test(normalized)) {
      localStorage.removeItem(HOST_ROOM_STORAGE_KEY);
      return null;
    }

    return normalized;
  }

  private roomUrl(roomId: string): string {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?room=${roomId}`;
  }

  private updateHostControls(): void {
    const hasLeader = Boolean(this.leader);
    const activePlayback = this.leader?.getState() === 'L_RUNNING';

    this.bpmDownBtn.disabled = !hasLeader;
    this.bpmUpBtn.disabled = !hasLeader;
    this.startBtn.disabled = !hasLeader || activePlayback;
    this.stopBtn.disabled = !hasLeader || !activePlayback;
  }

  private applyHostBpm(value: number): void {
    this.currentBpm = this.clampBpm(value);
    this.hostBpmValue.textContent = String(this.currentBpm);

    if (!this.leader) {
      return;
    }

    const running = this.leader.getState() === 'L_RUNNING';
    if (!running) {
      this.leader.setBPM(this.currentBpm);
      return;
    }

    if (this.bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(this.bpmUpdateDebounceTimeoutId);
    }

    this.bpmUpdateDebounceTimeoutId = window.setTimeout(() => {
      this.bpmUpdateDebounceTimeoutId = null;
      if (this.leader) {
        this.leader.setBPM(this.currentBpm);
      }
    }, BPM_UPDATE_DEBOUNCE_MS);
  }

  private stopBpmHold(): void {
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
    if (!this.leader) {
      return;
    }
    this.applyHostBpm(this.currentBpm + delta);
  }

  private attachBpmHold(button: HTMLButtonElement, delta: number): void {
    button.addEventListener('pointerdown', (event) => {
      if (!this.leader || event.button !== 0) {
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
    });

    button.addEventListener('pointerup', () => this.stopBpmHold());
    button.addEventListener('pointerleave', () => this.stopBpmHold());
    button.addEventListener('pointercancel', () => this.stopBpmHold());

    button.addEventListener('click', (event) => {
      if (!this.leader) {
        return;
      }

      if (event.detail > 0 && Date.now() < this.suppressPointerClickUntil) {
        return;
      }

      this.applyBpmDelta(delta);
    });
  }

  private clearJoinTimer(): void {
    if (this.joinBpmTimer !== null) {
      clearInterval(this.joinBpmTimer);
      this.joinBpmTimer = null;
    }
  }

  private clearJoinHostTimeout(): void {
    if (this.joinHostTimeoutId !== null) {
      clearTimeout(this.joinHostTimeoutId);
      this.joinHostTimeoutId = null;
    }
  }

  private showJoinEntry(): void {
    this.joinEntry.classList.remove('hidden');
    this.joinLive.classList.add('hidden');
    this.clearJoinTimer();
    this.clearJoinHostTimeout();
    this.joinInProgress = false;
    this.setJoinInputDisabled(false);
    this.joinCodeInput.focus();
  }

  private enableJoinCodeReplaceOnNextEntry(): void {
    this.clearJoinCodeOnNextEntry = true;
  }

  private showJoinLive(): void {
    this.joinEntry.classList.add('hidden');
    this.joinLive.classList.remove('hidden');
  }

  private activateTab(tab: Mode): void {
    this.activeTab = tab;

    const isHost = tab === 'host';
    this.hostTabBtn.classList.toggle('active', isHost);
    this.hostTabBtn.setAttribute('aria-selected', String(isHost));
    this.joinTabBtn.classList.toggle('active', !isHost);
    this.joinTabBtn.setAttribute('aria-selected', String(!isHost));

    this.hostView.classList.toggle('hidden', !isHost);
    this.joinView.classList.toggle('hidden', isHost);
  }

  private async ensureHostRoom(forceNewCode = false): Promise<void> {
    if (this.leader) {
      this.updateHostControls();
      this.setBackendStatus('ok');
      return;
    }

    this.setBackendStatus('connecting');
    this.leader = new LeaderStateMachine(generatePeerId(), this.transportRuntime);
    this.leader.getMetronome().onBeatScheduled((_, isDownbeat) => {
      flashBeat(this.hostBeat, isDownbeat);
    });

    const preferredRoomId = forceNewCode ? undefined : this.loadStoredHostRoomCode();
    const roomId = await this.leader.createRoom(this.currentBpm, preferredRoomId ?? undefined);
    this.setHostRoomCode(roomId);
    this.setBackendStatus('ok');
    this.startHostStatusTimer();
    this.updateHostControls();
  }

  private async regenerateHostRoom(): Promise<void> {
    if (this.activeTab !== 'host') {
      return;
    }

    if (this.leader) {
      await this.teardownHost();
    }

    this.applyHostBpm(120);
    await this.ensureHostRoom(true);
    this.showHostTemporaryStatus('New room code generated');
  }

  private async teardownHost(): Promise<void> {
    if (!this.leader) {
      return;
    }

    if (this.bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(this.bpmUpdateDebounceTimeoutId);
      this.bpmUpdateDebounceTimeoutId = null;
    }

    this.leader.stopMetronome();
    await this.leader.closeRoom();
    this.leader = null;
    this.setHostRoomCode(null);
    this.stopHostStatusTimer();
    this.refreshHostStatus();
    this.updateHostControls();
    this.setBackendStatus('idle');
  }

  private async teardownPeer(): Promise<void> {
    if (!this.peer) {
      return;
    }

    await this.peer.leaveRoom();
    this.peer = null;
    this.clearJoinTimer();
    this.showJoinEntry();
    this.setJoinStatus('Enter a room code to join.');
    this.setBackendStatus('idle');
  }

  private async switchToHost(): Promise<void> {
    await this.teardownPeer();
    this.activateTab('host');
    await this.ensureHostRoom();
  }

  private async switchToJoin(): Promise<void> {
    await this.teardownHost();
    this.activateTab('join');
    this.setJoinStatus('Enter a room code to join.');
    this.enableJoinCodeReplaceOnNextEntry();
    this.showJoinEntry();
  }

  private async joinRoom(roomId: string): Promise<void> {
    await this.teardownPeer();
    this.setJoinStatus('Joining room...');
    this.setBackendStatus('connecting');
    this.clearJoinHostTimeout();
    this.joinInProgress = true;
    this.setJoinInputDisabled(true);

    this.peer = new PeerStateMachine(generatePeerId(), this.transportRuntime);
    this.peer.getMetronome().onBeatScheduled((_, isDownbeat) => {
      flashBeat(this.joinBeat, isDownbeat);
    });

    this.peer.onStart(() => {
      this.clearJoinHostTimeout();
      this.showJoinLive();
      this.setJoinLiveStatus('Running.');

      this.joinBpmValue.textContent = String(this.peer?.getMetronome().getBPM() ?? this.currentBpm);
      this.clearJoinTimer();
      this.joinBpmTimer = window.setInterval(() => {
        if (this.peer) {
          this.joinBpmValue.textContent = String(this.peer.getMetronome().getBPM());
        }
      }, 300);
    });

    this.peer.onSyncStatus((status) => {
      this.clearJoinHostTimeout();
      this.setBackendStatus('ok');
      this.showJoinLive();
      this.setJoinLiveStatus(status);
    });

    await this.peer.joinRoom(roomId);
    this.setJoinStatus('Waiting for host...');
    this.joinHostTimeoutId = window.setTimeout(() => {
      if (!this.peer) {
        return;
      }

      const state = this.peer.getState();
      if (state === 'C_DISCOVERING' || state === 'C_SIGNALING') {
        this.teardownPeer()
          .then(() => {
            this.setJoinStatus('Host not found. Try another code.');
            this.enableJoinCodeReplaceOnNextEntry();
            this.setBackendStatus('error', 'No host responded for this room code');
          })
          .catch((error) => {
            console.error(error);
            this.setJoinStatus('Host not found. Try another code.');
            this.enableJoinCodeReplaceOnNextEntry();
            this.setBackendStatus('error', this.errorText(error));
          });
      }
    }, AppShellController.JOIN_HOST_TIMEOUT_MS);

    this.joinInProgress = false;
  }

  private maybeAutoJoin(): void {
    if (this.activeTab !== 'join' || this.joinInProgress || this.peer) {
      return;
    }

    const roomId = this.getJoinCode();
    if (roomId.length !== 6) {
      return;
    }

    this.joinRoom(roomId).catch((error) => {
      console.error(error);
      this.joinInProgress = false;
      this.setJoinInputDisabled(false);
      this.setJoinStatus('Join failed. Try another code.');
      this.enableJoinCodeReplaceOnNextEntry();
      this.showJoinEntry();
      this.setBackendStatus('error', this.errorText(error));
    });
  }

  private async copyCodeOnly(): Promise<void> {
    if (!this.currentRoomId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(this.currentRoomId);
      this.showHostTemporaryStatus('Code copied');
    } catch {
      // No-op: unavailable clipboard API should not block UX.
    }
  }

  private openQrModal(): void {
    if (!this.currentRoomId) {
      return;
    }

    this.qrNode.innerHTML = '';
    new QRCode(this.qrNode, {
      text: this.roomUrl(this.currentRoomId),
      width: 220,
      height: 220,
      colorDark: '#111111',
      colorLight: '#ffffff'
    });
    this.qrModal.classList.remove('hidden');
  }

  private startHostMetronome(): void {
    if (!this.leader) {
      return;
    }

    if (this.bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(this.bpmUpdateDebounceTimeoutId);
      this.bpmUpdateDebounceTimeoutId = null;
      this.leader.setBPM(this.currentBpm);
    }

    this.leader.startMetronome();
    this.updateHostControls();
  }

  private stopHostMetronome(): void {
    if (!this.leader) {
      return;
    }

    this.leader.stopMetronome();
    this.updateHostControls();
  }

}

export function initAppShell(config: AppShellConfig): void {
  const controller = new AppShellController(config);
  controller.init();
}
