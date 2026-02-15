<script lang="ts">
  export let activeTab: 'host' | 'join' = 'host';
  export let onHost: () => void;
  export let onJoin: () => void;
</script>

<header class="tabs" role="tablist" aria-label="Mode">
  <button
    class="tab"
    class:active={activeTab === 'host'}
    role="tab"
    aria-selected={activeTab === 'host'}
    onclick={onHost}>Host</button
  >
  <button
    class="tab"
    class:active={activeTab === 'join'}
    role="tab"
    aria-selected={activeTab === 'join'}
    onclick={onJoin}>Join</button
  >
</header>
