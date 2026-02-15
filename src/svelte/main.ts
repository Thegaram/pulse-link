import '../../styles.css';
import { mount } from 'svelte';
import App from './App.svelte';
import { loadRuntimeConfig } from './config-loader.js';

void (async () => {
  const config = await loadRuntimeConfig();

  mount(App, {
    target: document.getElementById('app')!,
    props: { config }
  });
})();
