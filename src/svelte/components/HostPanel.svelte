<script lang="ts">
  export let hidden = false;
  export let roomCode = '------';
  export let bpm = 120;
  export let status = 'Connected peers: 0';
  export let bpmDisabled = true;
  export let startDisabled = true;
  export let stopDisabled = true;

  export let beatEl: HTMLDivElement | null = null;

  export let onShare: () => void;
  export let onRegen: (event: MouseEvent) => void;
  export let onOpenQr: (event: MouseEvent) => void;
  export let onBpmDownPointerDown: (event: PointerEvent) => void;
  export let onBpmUpPointerDown: (event: PointerEvent) => void;
  export let onBpmDownClick: (event: MouseEvent) => void;
  export let onBpmUpClick: (event: MouseEvent) => void;
  export let onBpmPointerStop: () => void;
  export let onStart: () => void;
  export let onStop: () => void;

  function onShareKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onShare();
    }
  }
</script>

<section class="view" class:hidden>
  <div class="room-share" title="Copy code and show QR" role="button" tabindex="0" onclick={onShare} onkeydown={onShareKeydown}>
    <button class="qr-icon-btn qr-icon-left" aria-label="Reset room and generate new code" onclick={onRegen}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M17.7 6.3A8 8 0 1 0 20 12h-2a6 6 0 1 1-1.76-4.24L13 11h8V3l-3.3 3.3z"></path>
      </svg>
    </button>
    <button class="qr-icon-btn" aria-label="Show room QR code" onclick={onOpenQr}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="3" width="6" height="6"></rect>
        <rect x="15" y="3" width="6" height="6"></rect>
        <rect x="3" y="15" width="6" height="6"></rect>
        <rect x="16" y="16" width="2" height="2"></rect>
        <rect x="19" y="16" width="2" height="2"></rect>
        <rect x="16" y="19" width="2" height="2"></rect>
        <rect x="11" y="11" width="2" height="2"></rect>
        <rect x="13" y="13" width="2" height="2"></rect>
      </svg>
    </button>
    <div class="room-code">{roomCode}</div>
  </div>

  <div class="stage">
    <div class="beat" bind:this={beatEl}></div>
  </div>

  <div class="host-bpm-value">{bpm}</div>

  <div class="control-row">
    <button
      class="btn btn-soft btn-big"
      aria-label="Decrease BPM"
      disabled={bpmDisabled}
      onpointerdown={onBpmDownPointerDown}
      onpointerup={onBpmPointerStop}
      onpointerleave={onBpmPointerStop}
      onpointercancel={onBpmPointerStop}
      onclick={onBpmDownClick}
    >-</button>
    <button
      class="btn btn-soft btn-big"
      aria-label="Increase BPM"
      disabled={bpmDisabled}
      onpointerdown={onBpmUpPointerDown}
      onpointerup={onBpmPointerStop}
      onpointerleave={onBpmPointerStop}
      onpointercancel={onBpmPointerStop}
      onclick={onBpmUpClick}
    >+</button>
    <button class="btn btn-primary" disabled={startDisabled} onclick={onStart}>Start</button>
    <button class="btn btn-danger" disabled={stopDisabled} onclick={onStop}>Stop</button>
  </div>

  <p class="status">{status}</p>
</section>
