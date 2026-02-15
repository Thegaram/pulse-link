<script lang="ts">
  export let hidden = false;
  export let showEntry = true;
  export let showLive = false;
  export let joinCode = '';
  export let roomCodeDisplay = '------';
  export let joinCodeVisual = '_ _ _ _ _ _';
  export let joinStatus = 'Enter a room code to join.';
  export let joinLiveStatus = 'Connected. Waiting for host to start.';
  export let joinBpm = 120;
  export let inputDisabled = false;

  export let inputEl: HTMLInputElement | null = null;
  export let beatEl: HTMLDivElement | null = null;

  export let onCodeLineClick: () => void;
  export let onEditRoom: () => void;
  export let onCodeInput: (event: Event) => void;
  export let onCodeKeydown: (event: KeyboardEvent) => void;
  export let onCodePaste: (event: ClipboardEvent) => void;

  function onCodeLineKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onCodeLineClick();
    }
  }

  $: isWaitingForHost = joinLiveStatus.toLowerCase().includes('waiting for host to start');
</script>

<section class="view" class:hidden>
  <div class="join-entry" class:hidden={!showEntry}>
    <div class="code-line" class:disabled={inputDisabled} aria-label="6-character room code" role="button" tabindex="0" onclick={onCodeLineClick} onkeydown={onCodeLineKeydown}>
      <span class="code-line-visual">{joinCodeVisual}</span>
      <input
        class="code-line-input"
        type="text"
        inputmode="text"
        maxlength="6"
        autocomplete="one-time-code"
        aria-label="Room code"
        disabled={inputDisabled}
        value={joinCode}
        bind:this={inputEl}
        oninput={onCodeInput}
        onkeydown={onCodeKeydown}
        onpaste={onCodePaste}
      />
    </div>
    <p class="status">{joinStatus}</p>
  </div>

  <div class="join-live" class:hidden={!showLive}>
    <div class="room-share join-room-ref" aria-label="Current room code">
      <button class="qr-icon-btn" type="button" aria-label="Edit room code" onclick={onEditRoom}>
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M3 17.25V21h3.75L17.8 9.94l-3.75-3.75L3 17.25zm14.71-9.04a1 1 0 0 0 0-1.41l-1.5-1.5a1 1 0 0 0-1.41 0l-1.17 1.17 3.75 3.75 1.33-1.01z"></path>
        </svg>
      </button>
      <div class="room-code">{roomCodeDisplay}</div>
    </div>
    <div class="stage">
      <div class="beat" class:waiting={isWaitingForHost} bind:this={beatEl}></div>
    </div>
    <div class="join-bpm-block">
      <div class="join-bpm-value">{joinBpm}</div>
      <div class="join-bpm-label">BPM</div>
    </div>
    <p class="status">{joinLiveStatus}</p>
  </div>
</section>
