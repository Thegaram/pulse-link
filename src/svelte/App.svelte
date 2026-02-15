<script lang="ts">
  import { get } from 'svelte/store';
  import { onDestroy, onMount, tick } from 'svelte';
  import Tabs from './components/Tabs.svelte';
  import HostPanel from './components/HostPanel.svelte';
  import JoinPanel from './components/JoinPanel.svelte';
  import MetaRow from './components/MetaRow.svelte';
  import QrModal from './components/QrModal.svelte';

  import { createSignalingTransport } from '../signaling/factory.js';
  import { createTransportRuntime } from '../realtime/runtime.js';
  import type { TransportRuntime } from '../realtime/runtime.js';
  import type { Mode } from '../ui/app-shell-constants.js';
  import type { LoadedConfig } from './config-loader.js';
  import { AppWorkflowController, type BackendState } from './state/controller.js';
  import {
    hostRoomCodeDisplay,
    hostState,
    hostStatusText,
    setHostBpm,
    setHostPeerCount,
    setHostRoomCode,
    setHostRunning,
    showHostTemporaryStatus
  } from './state/host.js';
  import {
    joinCodeVisual,
    joinState,
    setJoinBpm,
    setJoinClearCodeOnNextEntry,
    setJoinCode,
    setJoinInProgress,
    setJoinInputDisabled,
    setJoinLiveStatus,
    setJoinShowEntry,
    setJoinShowLive,
    setJoinStatus
  } from './state/join.js';
  import { sessionState, setLeader, setPeer } from './state/session.js';
  import { backendText, setActiveTab, setBackendLabel, setBackendStatus, setQrOpen, uiState } from './state/ui.js';
  import { backendLabel, clampBpm, sanitizeCode, shouldAutoJoin } from './state/runtime-ops.js';
  import {
    copyTextToClipboard,
    loadStoredHostRoomCode,
    persistHostRoomCode,
    readSharedRoomCodeFromUrl,
    renderQrCode
  } from './services/browser.js';

  export let config: LoadedConfig;

  let transportRuntime: TransportRuntime;
  let workflow: AppWorkflowController | null = null;

  let hostBeatEl: HTMLDivElement | null = null;
  let joinBeatEl: HTMLDivElement | null = null;
  let joinInputEl: HTMLInputElement | null = null;
  let qrNodeEl: HTMLDivElement | null = null;

  $: hasLeader = Boolean($sessionState.leader);
  $: activePlayback = $hostState.isRunning;
  $: bpmDisabled = !hasLeader;
  $: startDisabled = !hasLeader || activePlayback;
  $: stopDisabled = !hasLeader || !activePlayback;

  function errorText(error: unknown): string {
    if (error instanceof Error && error.message) {
      return error.message;
    }
    return 'Connection error';
  }

  function setBackendStatusWithDetail(state: BackendState, detail = ''): void {
    setBackendStatus(state, detail);
  }

  function setJoinCodeValue(code: string): void {
    setJoinCode(sanitizeCode(code));
  }

  function setHostRoomCodeWithPersistence(code: string | null): void {
    setHostRoomCode(code);
    persistHostRoomCode(code);
  }

  function applyHostBpm(value: number): void {
    const bpm = clampBpm(value);
    setHostBpm(bpm);

    const leader = get(sessionState).leader;
    if (!leader) {
      return;
    }

    const running = leader.getState() === 'L_RUNNING';
    if (!running) {
      leader.setBPM(bpm);
      return;
    }

    workflow?.queueRunningBpmUpdate(() => {
      const currentLeader = get(sessionState).leader;
      const currentBpm = get(hostState).currentBpm;
      currentLeader?.setBPM(currentBpm);
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
    setJoinShowEntry();
    void tick().then(() => {
      joinInputEl?.focus();
    });
  }

  function enableJoinCodeReplaceOnNextEntry(): void {
    setJoinClearCodeOnNextEntry(true);
  }

  function showJoinLive(): void {
    setJoinShowLive();
  }

  function activateTab(tab: Mode): void {
    setActiveTab(tab);
  }

  function initializeWorkflow(): void {
    workflow = new AppWorkflowController(transportRuntime, {
      getActiveTab: () => get(uiState).activeTab,
      getCurrentBpm: () => get(hostState).currentBpm,
      getJoinCode: () => get(joinState).code,
      getLeader: () => get(sessionState).leader,
      setLeader,
      getPeer: () => get(sessionState).peer,
      setPeer,
      setHostRunning,
      setHostPeerCount,
      setJoinStatus,
      setJoinLiveStatus,
      setJoinBpm,
      setJoinInProgress,
      setJoinInputDisabled,
      setBackendStatus: setBackendStatusWithDetail,
      loadStoredHostRoomCode,
      setHostRoomCode: setHostRoomCodeWithPersistence,
      showHostTemporaryStatus,
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
    const state = get(joinState);
    const session = get(sessionState);
    const ui = get(uiState);
    if (!shouldAutoJoin(ui.activeTab, state.inProgress, Boolean(session.peer), state.code)) {
      return;
    }

    workflow?.joinRoom(state.code).catch((error) => {
      console.error(error);
      setJoinInProgress(false);
      setJoinInputDisabled(false);
      setJoinStatus('Join failed. Try another code.');
      enableJoinCodeReplaceOnNextEntry();
      showJoinEntry();
      setBackendStatusWithDetail('error', errorText(error));
    });
  }

  async function copyCodeOnly(): Promise<void> {
    const code = get(hostState).currentRoomId;
    if (!code) {
      return;
    }

    const copied = await copyTextToClipboard(code);
    if (copied) {
      showHostTemporaryStatus('Code copied');
    }
  }

  function closeQrModal(): void {
    setQrOpen(false);
  }

  async function openQrModal(event: MouseEvent): Promise<void> {
    event.stopPropagation();

    const code = get(hostState).currentRoomId;
    if (!code) {
      return;
    }

    setQrOpen(true);
    await tick();

    if (!qrNodeEl) {
      return;
    }

    renderQrCode(qrNodeEl, code);
  }

  function startHostMetronome(): void {
    workflow?.startHostMetronome();
  }

  function stopHostMetronome(): void {
    workflow?.stopHostMetronome();
  }

  function onJoinCodeLineClick(): void {
    if (!get(joinState).inputDisabled) {
      joinInputEl?.focus();
    }
  }

  function onJoinCodeInput(event: Event): void {
    const target = event.currentTarget as HTMLInputElement;
    setJoinCodeValue(target.value);
    maybeAutoJoin();
  }

  function onJoinCodeKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      maybeAutoJoin();
      return;
    }

    const state = get(joinState);
    if (!state.clearCodeOnNextEntry) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const printable = event.key.length === 1;
    if (printable) {
      setJoinCode('');
      setJoinClearCodeOnNextEntry(false);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      setJoinCode('');
      setJoinClearCodeOnNextEntry(false);
      event.preventDefault();
    }
  }

  function onJoinCodePaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') ?? '').toUpperCase();
    setJoinClearCodeOnNextEntry(false);
    setJoinCodeValue(pasted);
    maybeAutoJoin();
  }

  function onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && get(uiState).qrOpen) {
      closeQrModal();
    }
  }

  function onHostTabClick(): void {
    if (get(uiState).activeTab === 'host') {
      return;
    }

    switchToHost().catch((error) => {
      console.error(error);
      setHostPeerCount(0);
      setBackendStatusWithDetail('error', errorText(error));
    });
  }

  function onJoinTabClick(): void {
    if (get(uiState).activeTab === 'join') {
      return;
    }

    switchToJoin().catch((error) => {
      console.error(error);
      setJoinStatus('Failed to open join mode.');
      setBackendStatusWithDetail('error', errorText(error));
    });
  }

  onMount(() => {
    transportRuntime = createTransportRuntime({
      mode: config.transportMode,
      iceConfig: config.iceConfig,
      createSignaling: () => createSignalingTransport(config.signaling)
    });
    initializeWorkflow();

    setBackendLabel(backendLabel(config.signaling.backend));
    setBackendStatusWithDetail('idle');

    document.addEventListener('keydown', onDocumentKeydown);
    document.addEventListener('pointerup', stopBpmHold);

    const sharedRoom = readSharedRoomCodeFromUrl();
    if (sharedRoom) {
      activateTab('join');
      setJoinCode(sharedRoom);
      showJoinEntry();
      setJoinStatus('Joining room...');
      maybeAutoJoin();
    } else {
      activateTab('host');
      workflow?.ensureHostRoom().catch((error) => {
        console.error(error);
        setHostPeerCount(0);
        setBackendStatusWithDetail('error', errorText(error));
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
    <Tabs activeTab={$uiState.activeTab} onHost={onHostTabClick} onJoin={onJoinTabClick} />
    <div class="panel-frame">
      <HostPanel
        hidden={$uiState.activeTab !== 'host'}
        roomCode={$hostRoomCodeDisplay}
        bpm={$hostState.currentBpm}
        status={$hostStatusText}
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
        hidden={$uiState.activeTab !== 'join'}
        showEntry={$joinState.showEntry}
        showLive={$joinState.showLive}
        joinCode={$joinState.code}
        joinCodeVisual={$joinCodeVisual}
        joinStatus={$joinState.status}
        joinLiveStatus={$joinState.liveStatus}
        joinBpm={$joinState.bpm}
        inputDisabled={$joinState.inputDisabled}
        bind:inputEl={joinInputEl}
        bind:beatEl={joinBeatEl}
        onCodeLineClick={onJoinCodeLineClick}
        onCodeInput={onJoinCodeInput}
        onCodeKeydown={onJoinCodeKeydown}
        onCodePaste={onJoinCodePaste}
      />
    </div>
  </main>

  <MetaRow appVersion={config.appVersion} backendText={$backendText} backendState={$uiState.backendState} backendTitle={$uiState.backendTitle} />
</div>

<QrModal open={$uiState.qrOpen} bind:qrNodeEl={qrNodeEl} onClose={closeQrModal} />
