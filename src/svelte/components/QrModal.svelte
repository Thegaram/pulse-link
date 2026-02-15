<script lang="ts">
  export let open = false;
  export let qrNodeEl: HTMLDivElement | null = null;
  export let onClose: () => void;

  function onBackdropClick(event: MouseEvent): void {
    if (event.currentTarget === event.target) {
      onClose();
    }
  }

  function onModalKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      onClose();
    }
  }
</script>

<div class="modal" class:hidden={!open} role="dialog" aria-modal="true" aria-labelledby="qrTitle" tabindex="-1" onclick={onBackdropClick} onkeydown={onModalKeydown}>
  <div class="modal-card">
    <h2 id="qrTitle">Share Room</h2>
    <div id="qrcode" bind:this={qrNodeEl}></div>
    <button class="btn btn-primary" onclick={onClose}>Close</button>
  </div>
</div>
