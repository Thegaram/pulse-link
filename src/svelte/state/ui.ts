import type { Mode } from '../../ui/app-shell-constants.js';

export type BackendState = 'idle' | 'connecting' | 'ok' | 'error';

export interface UiState {
  activeTab: Mode;
  backendState: BackendState;
  backendText: string;
  backendTitle: string;
  qrOpen: boolean;
}

export function createUiState(initialBackendText: string): UiState {
  return {
    activeTab: 'host',
    backendState: 'idle',
    backendText: initialBackendText,
    backendTitle: '',
    qrOpen: false
  };
}
