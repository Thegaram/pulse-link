<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import Tabs from './components/Tabs.svelte';
  import HostPanel from './components/HostPanel.svelte';
  import JoinPanel from './components/JoinPanel.svelte';
  import MetaRow from './components/MetaRow.svelte';
  import QrModal from './components/QrModal.svelte';

  import { LeaderStateMachine } from '../state/leader-machine.js';
  import { PeerStateMachine } from '../state/peer-machine.js';
  import { generatePeerId } from '../types.js';
  import { createSignalingTransport } from '../signaling/factory.js';
  import { createTransportRuntime } from '../realtime/runtime.js';
  import type { TransportRuntime } from '../realtime/runtime.js';
  import { flashBeat } from '../ui/dom.js';
  import { BPM_UPDATE_DEBOUNCE_MS } from '../ui/app-shell-constants.js';
  import type { Mode } from '../ui/app-shell-constants.js';
  import type { LoadedConfig } from './config-loader.js';
  import { createHostViewState } from './state/host.js';
  import { createJoinViewState } from './state/join.js';
  import { createUiState, type BackendState } from './state/ui.js';
  import {
    backendLabel,
    clampBpm,
    formatBackendText,
    formatJoinCodeVisual,
    getHostRoomCodeDisplay,
    loadStoredHostRoomCode,
    persistHostRoomCode,
    roomUrl,
    sanitizeCode,
    shouldAutoJoin
  } from './state/runtime-ops.js';

  declare const QRCode: {
    new (element: HTMLElement, options: {
      text: string;
      width: number;
      height: number;
      colorDark: string;
      colorLight: string;
    }): unknown;
  };

  const JOIN_HOST_TIMEOUT_MS = 7000;

  export let config: LoadedConfig;

  let transportRuntime: TransportRuntime;

  let leader: LeaderStateMachine | null = null;
  let peer: PeerStateMachine | null = null;

  let host = createHostViewState();
  let join = createJoinViewState();
  let ui = createUiState('Ably');

  let hostBeatEl: HTMLDivElement | null = null;
  let joinBeatEl: HTMLDivElement | null = null;
  let joinInputEl: HTMLInputElement | null = null;
  let qrNodeEl: HTMLDivElement | null = null;

  let joinBpmTimer: number | null = null;
  let joinHostTimeoutId: number | null = null;
  let hostStatusTimer: number | null = null;
  let bpmHoldIntervalId: number | null = null;
  let bpmHoldStartTimeoutId: number | null = null;
  let bpmUpdateDebounceTimeoutId: number | null = null;

  let suppressPointerClickUntil = 0;

  $: hasLeader = Boolean(leader);
  $: activePlayback = host.isRunning;
  $: bpmDisabled = !hasLeader;
  $: startDisabled = !hasLeader || activePlayback;
  $: stopDisabled = !hasLeader || !activePlayback;
  $: hostRoomCodeDisplay = getHostRoomCodeDisplay(host.currentRoomId);
  $: joinCodeVisual = formatJoinCodeVisual(join.code);

  function errorText(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Connection error';
  }

  function setBackendStatus(state: BackendState, detail = ''): void {
    ui.backendState = state;
    ui.backendTitle = detail;
    ui.backendText = formatBackendText(backendLabel(config.signaling.backend), state);
  }

  function setJoinCode(code: string): void {
    join.code = sanitizeCode(code);
  }

  function setJoinInputDisabled(disabled: boolean): void {
    join.inputDisabled = disabled;
  }

  function clearJoinTimer(): void {
    if (joinBpmTimer !== null) {
      clearInterval(joinBpmTimer);
      joinBpmTimer = null;
    }
  }

  function clearJoinHostTimeout(): void {
    if (joinHostTimeoutId !== null) {
      clearTimeout(joinHostTimeoutId);
      joinHostTimeoutId = null;
    }
  }

  function stopHostStatusTimer(): void {
    if (hostStatusTimer !== null) {
      clearInterval(hostStatusTimer);
      hostStatusTimer = null;
    }
  }

  function refreshHostStatus(): void {
    if (Date.now() < host.statusOverrideUntil) {
      host.status = host.statusOverrideText;
      return;
    }

    const peers = leader ? leader.getPeerCount() : 0;
    host.status = `Connected peers: ${peers}`;
  }

  function startHostStatusTimer(): void {
    stopHostStatusTimer();
    refreshHostStatus();
    hostStatusTimer = window.setInterval(() => {
      refreshHostStatus();
    }, 500);
  }

  function showHostTemporaryStatus(text: string, durationMs = 1200): void {
    host.statusOverrideText = text;
    host.statusOverrideUntil = Date.now() + durationMs;
    refreshHostStatus();
  }

  function setHostRoomCode(code: string | null): void {
    host.currentRoomId = code;
    persistHostRoomCode(code);
  }

  function applyHostBpm(value: number): void {
    host.currentBpm = clampBpm(value);

    if (!leader) {
      return;
    }

    const running = leader.getState() === 'L_RUNNING';
    if (!running) {
      leader.setBPM(host.currentBpm);
      return;
    }

    if (bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(bpmUpdateDebounceTimeoutId);
    }

    bpmUpdateDebounceTimeoutId = window.setTimeout(() => {
      bpmUpdateDebounceTimeoutId = null;
      if (leader) {
        leader.setBPM(host.currentBpm);
      }
    }, BPM_UPDATE_DEBOUNCE_MS);
  }

  function stopBpmHold(): void {
    if (bpmHoldStartTimeoutId !== null) {
      clearTimeout(bpmHoldStartTimeoutId);
      bpmHoldStartTimeoutId = null;
    }

    if (bpmHoldIntervalId !== null) {
      clearInterval(bpmHoldIntervalId);
      bpmHoldIntervalId = null;
    }
  }

  function applyBpmDelta(delta: number): void {
    if (!leader) {
      return;
    }
    applyHostBpm(host.currentBpm + delta);
  }

  function onBpmPointerDown(delta: number, event: PointerEvent): void {
    if (!leader || event.button !== 0) {
      return;
    }

    event.preventDefault();
    suppressPointerClickUntil = Date.now() + 300;
    applyBpmDelta(delta);

    stopBpmHold();
    bpmHoldStartTimeoutId = window.setTimeout(() => {
      bpmHoldIntervalId = window.setInterval(() => {
        applyBpmDelta(delta);
      }, 70);
    }, 300);
  }

  function onBpmClick(delta: number, event: MouseEvent): void {
    if (!leader) {
      return;
    }

    if (event.detail > 0 && Date.now() < suppressPointerClickUntil) {
      return;
    }

    applyBpmDelta(delta);
  }

  function showJoinEntry(): void {
    join.showEntry = true;
    join.showLive = false;
    clearJoinTimer();
    clearJoinHostTimeout();
    join.inProgress = false;
    setJoinInputDisabled(false);
    void tick().then(() => {
      joinInputEl?.focus();
    });
  }

  function enableJoinCodeReplaceOnNextEntry(): void {
    join.clearCodeOnNextEntry = true;
  }

  function showJoinLive(): void {
    join.showEntry = false;
    join.showLive = true;
  }

  function activateTab(tab: Mode): void {
    ui.activeTab = tab;
  }

  async function ensureHostRoom(forceNewCode = false): Promise<void> {
    if (leader) {
      setBackendStatus('ok');
      return;
    }

    setBackendStatus('connecting');
    leader = new LeaderStateMachine(generatePeerId(), transportRuntime);
    leader.getMetronome().onBeatScheduled((_, isDownbeat) => {
      if (hostBeatEl) {
        flashBeat(hostBeatEl, isDownbeat);
      }
    });

    const preferredRoomId = forceNewCode ? undefined : loadStoredHostRoomCode();
    const roomId = await leader.createRoom(host.currentBpm, preferredRoomId ?? undefined);
    setHostRoomCode(roomId);
    host.isRunning = false;
    setBackendStatus('ok');
    startHostStatusTimer();
  }

  async function regenerateHostRoom(event: MouseEvent): Promise<void> {
    event.stopPropagation();

    if (ui.activeTab !== 'host') {
      return;
    }

    if (leader) {
      await teardownHost();
    }

    applyHostBpm(120);
    await ensureHostRoom(true);
    showHostTemporaryStatus('New room code generated');
  }

  async function teardownHost(): Promise<void> {
    if (!leader) {
      return;
    }

    if (bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(bpmUpdateDebounceTimeoutId);
      bpmUpdateDebounceTimeoutId = null;
    }

    leader.stopMetronome();
    await leader.closeRoom();
    leader = null;
    host.isRunning = false;
    setHostRoomCode(null);
    stopHostStatusTimer();
    refreshHostStatus();
    setBackendStatus('idle');
  }

  async function teardownPeer(): Promise<void> {
    if (!peer) {
      return;
    }

    await peer.leaveRoom();
    peer = null;
    clearJoinTimer();
    showJoinEntry();
    join.status = 'Enter a room code to join.';
    setBackendStatus('idle');
  }

  async function switchToHost(): Promise<void> {
    await teardownPeer();
    activateTab('host');
    await ensureHostRoom();
  }

  async function switchToJoin(): Promise<void> {
    await teardownHost();
    activateTab('join');
    join.status = 'Enter a room code to join.';
    enableJoinCodeReplaceOnNextEntry();
    showJoinEntry();
  }

  async function joinRoom(roomId: string): Promise<void> {
    await teardownPeer();
    join.status = 'Joining room...';
    setBackendStatus('connecting');
    clearJoinHostTimeout();
    join.inProgress = true;
    setJoinInputDisabled(true);

    peer = new PeerStateMachine(generatePeerId(), transportRuntime);
    peer.getMetronome().onBeatScheduled((_, isDownbeat) => {
      if (joinBeatEl) {
        flashBeat(joinBeatEl, isDownbeat);
      }
    });

    peer.onStart(() => {
      clearJoinHostTimeout();
      showJoinLive();
      join.liveStatus = 'Running.';

      join.bpm = peer?.getMetronome().getBPM() ?? host.currentBpm;
      clearJoinTimer();
      joinBpmTimer = window.setInterval(() => {
        if (peer) {
          join.bpm = peer.getMetronome().getBPM();
        }
      }, 300);
    });

    peer.onSyncStatus((status) => {
      clearJoinHostTimeout();
      setBackendStatus('ok');
      showJoinLive();
      join.liveStatus = status;
    });

    await peer.joinRoom(roomId);
    join.status = 'Waiting for host...';
    joinHostTimeoutId = window.setTimeout(() => {
      if (!peer) {
        return;
      }

      const state = peer.getState();
      if (state === 'C_DISCOVERING' || state === 'C_SIGNALING') {
        teardownPeer()
          .then(() => {
            join.status = 'Host not found. Try another code.';
            enableJoinCodeReplaceOnNextEntry();
            setBackendStatus('error', 'No host responded for this room code');
          })
          .catch((error) => {
            console.error(error);
            join.status = 'Host not found. Try another code.';
            enableJoinCodeReplaceOnNextEntry();
            setBackendStatus('error', errorText(error));
          });
      }
    }, JOIN_HOST_TIMEOUT_MS);

    join.inProgress = false;
  }

  function maybeAutoJoin(): void {
    if (!shouldAutoJoin(ui.activeTab, join.inProgress, Boolean(peer), join.code)) {
      return;
    }

    joinRoom(join.code).catch((error) => {
      console.error(error);
      join.inProgress = false;
      setJoinInputDisabled(false);
      join.status = 'Join failed. Try another code.';
      enableJoinCodeReplaceOnNextEntry();
      showJoinEntry();
      setBackendStatus('error', errorText(error));
    });
  }

  async function copyCodeOnly(): Promise<void> {
    if (!host.currentRoomId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(host.currentRoomId);
      showHostTemporaryStatus('Code copied');
    } catch {
      // no-op
    }
  }

  function closeQrModal(): void {
    ui.qrOpen = false;
  }

  async function openQrModal(event: MouseEvent): Promise<void> {
    event.stopPropagation();

    if (!host.currentRoomId) {
      return;
    }

    ui.qrOpen = true;
    await tick();

    if (!qrNodeEl) {
      return;
    }

    qrNodeEl.innerHTML = '';
    new QRCode(qrNodeEl, {
      text: roomUrl(host.currentRoomId),
      width: 220,
      height: 220,
      colorDark: '#111111',
      colorLight: '#ffffff'
    });
  }

  function startHostMetronome(): void {
    if (!leader) {
      return;
    }

    if (bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(bpmUpdateDebounceTimeoutId);
      bpmUpdateDebounceTimeoutId = null;
      leader.setBPM(host.currentBpm);
    }

    leader.startMetronome();
    host.isRunning = true;
  }

  function stopHostMetronome(): void {
    if (!leader) {
      return;
    }

    leader.stopMetronome();
    host.isRunning = false;
  }

  function onJoinCodeLineClick(): void {
    if (!join.inputDisabled) {
      joinInputEl?.focus();
    }
  }

  function onJoinCodeInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    setJoinCode(target.value);
    maybeAutoJoin();
  }

  function onJoinCodeKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      maybeAutoJoin();
      return;
    }

    if (!join.clearCodeOnNextEntry) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const printable = event.key.length === 1;
    if (printable) {
      setJoinCode('');
      join.clearCodeOnNextEntry = false;
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      setJoinCode('');
      join.clearCodeOnNextEntry = false;
      event.preventDefault();
    }
  }

  function onJoinCodePaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') ?? '').toUpperCase();
    join.clearCodeOnNextEntry = false;
    setJoinCode(pasted);
    maybeAutoJoin();
  }

  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && ui.qrOpen) {
      closeQrModal();
    }
  }

  function onHostTabClick(): void {
    if (ui.activeTab === 'host') {
      return;
    }

    switchToHost().catch((error) => {
      console.error(error);
      stopHostStatusTimer();
      host.status = 'Connected peers: 0';
      setBackendStatus('error', errorText(error));
    });
  }

  function onJoinTabClick(): void {
    if (ui.activeTab === 'join') {
      return;
    }

    switchToJoin().catch((error) => {
      console.error(error);
      join.status = 'Failed to open join mode.';
      setBackendStatus('error', errorText(error));
    });
  }

  onMount(() => {
    transportRuntime = createTransportRuntime({
      mode: config.transportMode,
      iceConfig: config.iceConfig,
      createSignaling: () => createSignalingTransport(config.signaling)
    });

    setBackendStatus('idle');

    document.addEventListener('keydown', onDocumentKeydown);
    document.addEventListener('pointerup', stopBpmHold);

    const sharedRoom = new URLSearchParams(window.location.search).get('room');
    if (sharedRoom && sharedRoom.trim().length === 6) {
      activateTab('join');
      setJoinCode(sharedRoom.trim().toUpperCase());
      showJoinEntry();
      join.status = 'Joining room...';
      maybeAutoJoin();
    } else {
      activateTab('host');
      ensureHostRoom().catch((error) => {
        console.error(error);
        host.status = 'Connected peers: 0';
        setBackendStatus('error', errorText(error));
      });
    }

    return () => {
      document.removeEventListener('keydown', onDocumentKeydown);
      document.removeEventListener('pointerup', stopBpmHold);
    };
  });

  onDestroy(() => {
    stopBpmHold();
    clearJoinTimer();
    clearJoinHostTimeout();
    stopHostStatusTimer();

    if (bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(bpmUpdateDebounceTimeoutId);
      bpmUpdateDebounceTimeoutId = null;
    }

    void teardownPeer();
    void teardownHost();
  });
</script>

<div class="shell">
  <main class="app">
    <Tabs activeTab={ui.activeTab} onHost={onHostTabClick} onJoin={onJoinTabClick} />
    <div class="panel-frame">
      <HostPanel
        hidden={ui.activeTab !== 'host'}
        roomCode={hostRoomCodeDisplay}
        bpm={host.currentBpm}
        status={host.status}
        bpmDisabled={bpmDisabled}
        startDisabled={startDisabled}
        stopDisabled={stopDisabled}
        bind:beatEl={hostBeatEl}
        onShare={() => {
          void copyCodeOnly();
        }}
        onRegen={(event) => {
          void regenerateHostRoom(event);
        }}
        onOpenQr={(event) => {
          void openQrModal(event);
        }}
        onBpmDownPointerDown={(event) => onBpmPointerDown(-1, event)}
        onBpmUpPointerDown={(event) => onBpmPointerDown(+1, event)}
        onBpmDownClick={(event) => onBpmClick(-1, event)}
        onBpmUpClick={(event) => onBpmClick(+1, event)}
        onBpmPointerStop={stopBpmHold}
        onStart={startHostMetronome}
        onStop={stopHostMetronome}
      />
      <JoinPanel
        hidden={ui.activeTab !== 'join'}
        showEntry={join.showEntry}
        showLive={join.showLive}
        joinCode={join.code}
        joinCodeVisual={joinCodeVisual}
        joinStatus={join.status}
        joinLiveStatus={join.liveStatus}
        joinBpm={join.bpm}
        inputDisabled={join.inputDisabled}
        bind:inputEl={joinInputEl}
        bind:beatEl={joinBeatEl}
        onCodeLineClick={onJoinCodeLineClick}
        onCodeInput={onJoinCodeInput}
        onCodeKeydown={onJoinCodeKeydown}
        onCodePaste={onJoinCodePaste}
      />
    </div>
  </main>

  <MetaRow appVersion={config.appVersion} backendText={ui.backendText} backendState={ui.backendState} backendTitle={ui.backendTitle} />
</div>

<QrModal open={ui.qrOpen} bind:qrNodeEl={qrNodeEl} onClose={closeQrModal} />
