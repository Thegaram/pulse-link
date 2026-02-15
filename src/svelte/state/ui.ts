import { derived, writable } from 'svelte/store';
import type { Mode } from '../../ui/app-shell-constants.js';
import { formatBackendText } from './runtime-ops.js';

export type BackendState = 'idle' | 'connecting' | 'ok' | 'error';

export interface UiState {
  activeTab: Mode;
  backendState: BackendState;
  backendTitle: string;
  qrOpen: boolean;
  backendLabel: string;
}

const initialUiState: UiState = {
  activeTab: 'host',
  backendState: 'idle',
  backendTitle: '',
  qrOpen: false,
  backendLabel: 'Ably'
};

const { subscribe, update } = writable<UiState>(initialUiState);

export const uiState = { subscribe };

export const backendText = derived(uiState, ($ui) => formatBackendText($ui.backendLabel, $ui.backendState));

export function setActiveTab(activeTab: Mode): void {
  update((state) => ({ ...state, activeTab }));
}

export function setBackendLabel(backendLabel: string): void {
  update((state) => ({ ...state, backendLabel }));
}

export function setBackendStatus(backendState: BackendState, backendTitle = ''): void {
  update((state) => ({ ...state, backendState, backendTitle }));
}

export function setQrOpen(qrOpen: boolean): void {
  update((state) => ({ ...state, qrOpen }));
}

