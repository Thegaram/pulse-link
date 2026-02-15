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
  import { BPM_UPDATE_DEBOUNCE_MS, HOST_ROOM_STORAGE_KEY, MAX_BPM, MIN_BPM } from '../ui/app-shell-constants.js';
  import type { Mode } from '../ui/app-shell-constants.js';
  import type { LoadedConfig } from './config-loader.js';

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

  let currentRoomId: string | null = null;
  let currentBpm = 120;
  let isHostRunning = false;
  let activeTab: Mode = 'host';

  let hostStatus = 'Connected peers: 0';
  let joinStatus = 'Enter a room code to join.';
  let joinLiveStatus = 'Connected. Waiting for host to start.';

  let showJoinEntryState = true;
  let showJoinLiveState = false;

  let joinCode = '';
  let joinBpm = 120;
  let joinInputDisabled = false;

  let backendState: 'idle' | 'connecting' | 'ok' | 'error' = 'idle';
  let backendText = 'Ably';
  let backendTitle = '';

  let qrOpen = false;

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

  let hostStatusOverrideUntil = 0;
  let hostStatusOverrideText = '';
  let suppressPointerClickUntil = 0;
  let joinInProgress = false;
  let clearJoinCodeOnNextEntry = false;

  $: hasLeader = Boolean(leader);
  $: activePlayback = isHostRunning;
  $: bpmDisabled = !hasLeader;
  $: startDisabled = !hasLeader || activePlayback;
  $: stopDisabled = !hasLeader || !activePlayback;
  $: hostRoomCodeDisplay = currentRoomId ?? '------';
  $: joinCodeVisual = Array.from({ length: 6 }, (_, i) => joinCode.split('')[i] ?? '_').join(' ');

  function backendLabel(): string {
    if (config.signaling.backend === 'mock') {
      return 'Local';
    }
    if (config.signaling.backend === 'supabase') {
      return 'Supabase';
    }
    return 'Ably';
  }

  function errorText(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Connection error';
  }

  function setBackendStatus(state: 'idle' | 'connecting' | 'ok' | 'error', detail = ''): void {
    backendState = state;
    backendTitle = detail;

    let suffix = '';
    if (state === 'connecting') {
      suffix = ' connecting';
    } else if (state === 'error') {
      suffix = ' error';
    }

    backendText = `${backendLabel()}${suffix}`;
  }

  function sanitizeCode(value: string): string {
    return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  }

  function setJoinCode(code: string): void {
    joinCode = sanitizeCode(code);
  }

  function setJoinInputDisabled(disabled: boolean): void {
    joinInputDisabled = disabled;
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
    if (Date.now() < hostStatusOverrideUntil) {
      hostStatus = hostStatusOverrideText;
      return;
    }

    const peers = leader ? leader.getPeerCount() : 0;
    hostStatus = `Connected peers: ${peers}`;
  }

  function startHostStatusTimer(): void {
    stopHostStatusTimer();
    refreshHostStatus();
    hostStatusTimer = window.setInterval(() => {
      refreshHostStatus();
    }, 500);
  }

  function showHostTemporaryStatus(text: string, durationMs = 1200): void {
    hostStatusOverrideText = text;
    hostStatusOverrideUntil = Date.now() + durationMs;
    refreshHostStatus();
  }

  function setHostRoomCode(code: string | null): void {
    currentRoomId = code;

    if (code) {
      localStorage.setItem(HOST_ROOM_STORAGE_KEY, code);
    } else {
      localStorage.removeItem(HOST_ROOM_STORAGE_KEY);
    }
  }

  function loadStoredHostRoomCode(): string | null {
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

  function roomUrl(roomId: string): string {
    const base = `${window.location.origin}${window.location.pathname}`;
    return `${base}?room=${roomId}`;
  }

  function clampBpm(value: number): number {
    return Math.max(MIN_BPM, Math.min(MAX_BPM, value));
  }

  function applyHostBpm(value: number): void {
    currentBpm = clampBpm(value);

    if (!leader) {
      return;
    }

    const running = leader.getState() === 'L_RUNNING';
    if (!running) {
      leader.setBPM(currentBpm);
      return;
    }

    if (bpmUpdateDebounceTimeoutId !== null) {
      clearTimeout(bpmUpdateDebounceTimeoutId);
    }

    bpmUpdateDebounceTimeoutId = window.setTimeout(() => {
      bpmUpdateDebounceTimeoutId = null;
      if (leader) {
        leader.setBPM(currentBpm);
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
    applyHostBpm(currentBpm + delta);
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
    showJoinEntryState = true;
    showJoinLiveState = false;
    clearJoinTimer();
    clearJoinHostTimeout();
    joinInProgress = false;
    setJoinInputDisabled(false);
    void tick().then(() => {
      joinInputEl?.focus();
    });
  }

  function enableJoinCodeReplaceOnNextEntry(): void {
    clearJoinCodeOnNextEntry = true;
  }

  function showJoinLive(): void {
    showJoinEntryState = false;
    showJoinLiveState = true;
  }

  function activateTab(tab: Mode): void {
    activeTab = tab;
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
    const roomId = await leader.createRoom(currentBpm, preferredRoomId ?? undefined);
    setHostRoomCode(roomId);
    isHostRunning = false;
    setBackendStatus('ok');
    startHostStatusTimer();
  }

  async function regenerateHostRoom(event: MouseEvent): Promise<void> {
    event.stopPropagation();

    if (activeTab !== 'host') {
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
    isHostRunning = false;
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
    joinStatus = 'Enter a room code to join.';
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
    joinStatus = 'Enter a room code to join.';
    enableJoinCodeReplaceOnNextEntry();
    showJoinEntry();
  }

  async function joinRoom(roomId: string): Promise<void> {
    await teardownPeer();
    joinStatus = 'Joining room...';
    setBackendStatus('connecting');
    clearJoinHostTimeout();
    joinInProgress = true;
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
      joinLiveStatus = 'Running.';

      joinBpm = peer?.getMetronome().getBPM() ?? currentBpm;
      clearJoinTimer();
      joinBpmTimer = window.setInterval(() => {
        if (peer) {
          joinBpm = peer.getMetronome().getBPM();
        }
      }, 300);
    });

    peer.onSyncStatus((status) => {
      clearJoinHostTimeout();
      setBackendStatus('ok');
      showJoinLive();
      joinLiveStatus = status;
    });

    await peer.joinRoom(roomId);
    joinStatus = 'Waiting for host...';
    joinHostTimeoutId = window.setTimeout(() => {
      if (!peer) {
        return;
      }

      const state = peer.getState();
      if (state === 'C_DISCOVERING' || state === 'C_SIGNALING') {
        teardownPeer()
          .then(() => {
            joinStatus = 'Host not found. Try another code.';
            enableJoinCodeReplaceOnNextEntry();
            setBackendStatus('error', 'No host responded for this room code');
          })
          .catch((error) => {
            console.error(error);
            joinStatus = 'Host not found. Try another code.';
            enableJoinCodeReplaceOnNextEntry();
            setBackendStatus('error', errorText(error));
          });
      }
    }, JOIN_HOST_TIMEOUT_MS);

    joinInProgress = false;
  }

  function maybeAutoJoin(): void {
    if (activeTab !== 'join' || joinInProgress || peer) {
      return;
    }

    if (joinCode.length !== 6) {
      return;
    }

    joinRoom(joinCode).catch((error) => {
      console.error(error);
      joinInProgress = false;
      setJoinInputDisabled(false);
      joinStatus = 'Join failed. Try another code.';
      enableJoinCodeReplaceOnNextEntry();
      showJoinEntry();
      setBackendStatus('error', errorText(error));
    });
  }

  async function copyCodeOnly(): Promise<void> {
    if (!currentRoomId) {
      return;
    }

    try {
      await navigator.clipboard.writeText(currentRoomId);
      showHostTemporaryStatus('Code copied');
    } catch {
      // no-op
    }
  }

  function closeQrModal(): void {
    qrOpen = false;
  }

  async function openQrModal(event: MouseEvent): Promise<void> {
    event.stopPropagation();

    if (!currentRoomId) {
      return;
    }

    qrOpen = true;
    await tick();

    if (!qrNodeEl) {
      return;
    }

    qrNodeEl.innerHTML = '';
    new QRCode(qrNodeEl, {
      text: roomUrl(currentRoomId),
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
      leader.setBPM(currentBpm);
    }

    leader.startMetronome();
    isHostRunning = true;
  }

  function stopHostMetronome(): void {
    if (!leader) {
      return;
    }

    leader.stopMetronome();
    isHostRunning = false;
  }

  function onJoinCodeLineClick(): void {
    if (!joinInputDisabled) {
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

    if (!clearJoinCodeOnNextEntry) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const printable = event.key.length === 1;
    if (printable) {
      setJoinCode('');
      clearJoinCodeOnNextEntry = false;
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      setJoinCode('');
      clearJoinCodeOnNextEntry = false;
      event.preventDefault();
    }
  }

  function onJoinCodePaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') ?? '').toUpperCase();
    clearJoinCodeOnNextEntry = false;
    setJoinCode(pasted);
    maybeAutoJoin();
  }

  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && qrOpen) {
      closeQrModal();
    }
  }

  function onHostTabClick(): void {
    if (activeTab === 'host') {
      return;
    }

    switchToHost().catch((error) => {
      console.error(error);
      stopHostStatusTimer();
      hostStatus = 'Connected peers: 0';
      setBackendStatus('error', errorText(error));
    });
  }

  function onJoinTabClick(): void {
    if (activeTab === 'join') {
      return;
    }

    switchToJoin().catch((error) => {
      console.error(error);
      joinStatus = 'Failed to open join mode.';
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
      joinStatus = 'Joining room...';
      maybeAutoJoin();
    } else {
      activateTab('host');
      ensureHostRoom().catch((error) => {
        console.error(error);
        hostStatus = 'Connected peers: 0';
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
    <Tabs activeTab={activeTab} onHost={onHostTabClick} onJoin={onJoinTabClick} />
    <div class="panel-frame">
      <HostPanel
        hidden={activeTab !== 'host'}
        roomCode={hostRoomCodeDisplay}
        bpm={currentBpm}
        status={hostStatus}
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
        hidden={activeTab !== 'join'}
        showEntry={showJoinEntryState}
        showLive={showJoinLiveState}
        joinCode={joinCode}
        joinCodeVisual={joinCodeVisual}
        joinStatus={joinStatus}
        joinLiveStatus={joinLiveStatus}
        joinBpm={joinBpm}
        inputDisabled={joinInputDisabled}
        bind:inputEl={joinInputEl}
        bind:beatEl={joinBeatEl}
        onCodeLineClick={onJoinCodeLineClick}
        onCodeInput={onJoinCodeInput}
        onCodeKeydown={onJoinCodeKeydown}
        onCodePaste={onJoinCodePaste}
      />
    </div>
  </main>

  <MetaRow appVersion={config.appVersion} backendText={backendText} backendState={backendState} backendTitle={backendTitle} />
</div>

<QrModal open={qrOpen} bind:qrNodeEl={qrNodeEl} onClose={closeQrModal} />
