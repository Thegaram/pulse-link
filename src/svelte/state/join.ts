import { derived, writable } from 'svelte/store';
import { formatJoinCodeVisual } from './runtime-ops.js';

export interface JoinState {
  status: string;
  liveStatus: string;
  showEntry: boolean;
  showLive: boolean;
  code: string;
  bpm: number;
  inputDisabled: boolean;
  inProgress: boolean;
  clearCodeOnNextEntry: boolean;
}

const initialJoinState: JoinState = {
  status: 'Enter a room code to join.',
  liveStatus: 'Connected. Waiting for host to start.',
  showEntry: true,
  showLive: false,
  code: '',
  bpm: 120,
  inputDisabled: false,
  inProgress: false,
  clearCodeOnNextEntry: false
};

const { subscribe, update } = writable<JoinState>(initialJoinState);

export const joinState = { subscribe };
export const joinCodeVisual = derived(joinState, ($join) => formatJoinCodeVisual($join.code));

export function setJoinCode(code: string): void {
  update((state) => ({ ...state, code }));
}

export function setJoinStatus(status: string): void {
  update((state) => ({ ...state, status }));
}

export function setJoinLiveStatus(status: string): void {
  update((state) => ({ ...state, liveStatus: status }));
}

export function setJoinShowEntry(): void {
  update((state) => ({
    ...state,
    showEntry: true,
    showLive: false,
    inProgress: false,
    inputDisabled: false
  }));
}

export function setJoinShowLive(): void {
  update((state) => ({ ...state, showEntry: false, showLive: true }));
}

export function setJoinInputDisabled(inputDisabled: boolean): void {
  update((state) => ({ ...state, inputDisabled }));
}

export function setJoinInProgress(inProgress: boolean): void {
  update((state) => ({ ...state, inProgress }));
}

export function setJoinBpm(bpm: number): void {
  update((state) => ({ ...state, bpm }));
}

export function setJoinClearCodeOnNextEntry(clearCodeOnNextEntry: boolean): void {
  update((state) => ({ ...state, clearCodeOnNextEntry }));
}

export function resetJoinState(): void {
  update((state) => ({
    ...state,
    status: 'Enter a room code to join.',
    showEntry: true,
    showLive: false,
    bpm: 120,
    inputDisabled: false,
    inProgress: false,
    clearCodeOnNextEntry: false
  }));
}

