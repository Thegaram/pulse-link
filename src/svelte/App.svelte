<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import Tabs from './components/Tabs.svelte';
  import HostPanel from './components/HostPanel.svelte';
  import JoinPanel from './components/JoinPanel.svelte';
  import MetaRow from './components/MetaRow.svelte';
  import QrModal from './components/QrModal.svelte';

  import { createSignalingTransport } from '../signaling/factory.js';
  import { createTransportRuntime } from '../realtime/runtime.js';
  import type { TransportRuntime } from '../realtime/runtime.js';
  import { LeaderStateMachine } from '../state/leader-machine.js';
  import { PeerStateMachine } from '../state/peer-machine.js';
  import type { Mode } from '../ui/app-shell-constants.js';
  import type { LoadedConfig } from './config-loader.js';
  import { AppWorkflowController, type BackendState } from './state/controller.js';
  import { createHostViewState } from './state/host.js';
  import { createJoinViewState } from './state/join.js';
  import { createUiState } from './state/ui.js';
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

  export let config: LoadedConfig;

  let transportRuntime: TransportRuntime;
  let workflow: AppWorkflowController | null = null;

  let leader: LeaderStateMachine | null = null;
  let peer: PeerStateMachine | null = null;

  let host = createHostViewState();
  let join = createJoinViewState();
  let ui = createUiState('Ably');

  let hostBeatEl: HTMLDivElement | null = null;
  let joinBeatEl: HTMLDivElement | null = null;
  let joinInputEl: HTMLInputElement | null = null;
  let qrNodeEl: HTMLDivElement | null = null;

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

  function setHostStatus(status: string): void {
    if (Date.now() < host.statusOverrideUntil) {
      host.status = host.statusOverrideText;
      return;
    }
    host.status = status;
  }

  function showHostTemporaryStatus(text: string, durationMs = 1200): void {
    host.statusOverrideText = text;
    host.statusOverrideUntil = Date.now() + durationMs;
    setHostStatus(text);
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

    workflow?.queueRunningBpmUpdate(() => {
      if (leader) {
        leader.setBPM(host.currentBpm);
      }
    });
  }

  function onBpmPointerDown(delta: number, event: PointerEvent): void {
    workflow?.onBpmPointerDown(delta, event);
  }

  function onBpmClick(delta: number, event: MouseEvent): void {
    workflow?.onBpmClick(delta, event);
  }

  function stopBpmHold(): void {
    workflow?.stopBpmHold();
  }

  function showJoinEntry(): void {
    join.showEntry = true;
    join.showLive = false;
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

  function initializeWorkflow(): void {
    workflow = new AppWorkflowController(transportRuntime, {
      getActiveTab: () => ui.activeTab,
      getCurrentBpm: () => host.currentBpm,
      getJoinCode: () => join.code,
      getLeader: () => leader,
      setLeader: (nextLeader) => {
        leader = nextLeader;
      },
      getPeer: () => peer,
      setPeer: (nextPeer) => {
        peer = nextPeer;
      },
      setHostRunning: (running) => {
        host.isRunning = running;
      },
      setHostStatus,
      setJoinStatus: (status) => {
        join.status = status;
      },
      setJoinLiveStatus: (status) => {
        join.liveStatus = status;
      },
      setJoinBpm: (bpm) => {
        join.bpm = bpm;
      },
      setJoinInProgress: (inProgress) => {
        join.inProgress = inProgress;
      },
      setJoinInputDisabled,
      setBackendStatus,
      loadStoredHostRoomCode,
      setHostRoomCode,
      showHostTemporaryStatus: (text) => {
        showHostTemporaryStatus(text);
      },
      applyHostBpm,
      errorText,
      showJoinEntry,
      showJoinLive,
      enableJoinCodeReplaceOnNextEntry,
      getHostBeatEl: () => hostBeatEl,
      getJoinBeatEl: () => joinBeatEl,
      focusJoinInput: () => {
        joinInputEl?.focus();
      }
    });
  }

  async function regenerateHostRoom(event: MouseEvent): Promise<void> {
    event.stopPropagation();
    await workflow?.regenerateHostRoom();
  }

  async function switchToHost(): Promise<void> {
    activateTab('host');
    await workflow?.switchToHost();
  }

  async function switchToJoin(): Promise<void> {
    activateTab('join');
    await workflow?.switchToJoin();
  }

  function maybeAutoJoin(): void {
    if (!shouldAutoJoin(ui.activeTab, join.inProgress, Boolean(peer), join.code)) {
      return;
    }

    workflow?.joinRoom(join.code).catch((error) => {
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
    workflow?.startHostMetronome();
  }

  function stopHostMetronome(): void {
    workflow?.stopHostMetronome();
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
      setHostStatus('Connected peers: 0');
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
    initializeWorkflow();

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
      workflow?.ensureHostRoom().catch((error) => {
        console.error(error);
        setHostStatus('Connected peers: 0');
        setBackendStatus('error', errorText(error));
      });
    }

    return () => {
      document.removeEventListener('keydown', onDocumentKeydown);
      document.removeEventListener('pointerup', stopBpmHold);
    };
  });

  onDestroy(() => {
    workflow?.destroy();
    workflow = null;
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
