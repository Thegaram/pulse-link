<script lang="ts">
  export let appVersion = '';
  export let backendText = '';
  export let backendState: 'idle' | 'connecting' | 'ok' | 'error' = 'idle';
  export let backendTitle = '';
</script>

<div class="meta-row">
  <div class="app-version">{appVersion}</div>
  <div
    class="backend-status"
    class:state-idle={backendState === 'idle'}
    class:state-connecting={backendState === 'connecting'}
    class:state-ok={backendState === 'ok'}
    class:state-error={backendState === 'error'}
    aria-live="polite"
    title={backendTitle}
  >
    <span class="dot" aria-hidden="true"></span>
    <span>{backendText}</span>
  </div>
</div>
