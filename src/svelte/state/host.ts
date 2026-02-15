import { derived, writable } from 'svelte/store';
import { getHostRoomCodeDisplay } from './runtime-ops.js';

export interface HostState {
  currentRoomId: string | null;
  currentBpm: number;
  isRunning: boolean;
  hasPendingResume: boolean;
  peerCount: number;
  statusOverrideText: string;
}

const initialHostState: HostState = {
  currentRoomId: null,
  currentBpm: 120,
  isRunning: false,
  hasPendingResume: false,
  peerCount: 0,
  statusOverrideText: ''
};

const { subscribe, update } = writable<HostState>(initialHostState);
let statusOverrideTimerId: number | null = null;

export const hostState = { subscribe };

export const hostRoomCodeDisplay = derived(hostState, ($host) => getHostRoomCodeDisplay($host.currentRoomId));

export const hostStatusText = derived(hostState, ($host) => (
  $host.statusOverrideText || `Connected peers: ${$host.peerCount}`
));

export function setHostRoomCode(roomId: string | null): void {
  update((state) => ({ ...state, currentRoomId: roomId }));
}

export function setHostBpm(bpm: number): void {
  update((state) => ({ ...state, currentBpm: bpm }));
}

export function setHostRunning(isRunning: boolean): void {
  update((state) => ({ ...state, isRunning }));
}

export function setHostPendingResume(hasPendingResume: boolean): void {
  update((state) => ({ ...state, hasPendingResume }));
}

export function setHostPeerCount(peerCount: number): void {
  update((state) => ({ ...state, peerCount }));
}

export function showHostTemporaryStatus(text: string, durationMs = 1200): void {
  if (statusOverrideTimerId !== null) {
    clearTimeout(statusOverrideTimerId);
    statusOverrideTimerId = null;
  }

  update((state) => ({ ...state, statusOverrideText: text }));
  statusOverrideTimerId = window.setTimeout(() => {
    update((state) => ({ ...state, statusOverrideText: '' }));
    statusOverrideTimerId = null;
  }, durationMs);
}

export function resetHostState(): void {
  if (statusOverrideTimerId !== null) {
    clearTimeout(statusOverrideTimerId);
    statusOverrideTimerId = null;
  }
  update((state) => ({
    ...state,
    currentRoomId: null,
    isRunning: false,
    hasPendingResume: false,
    peerCount: 0,
    statusOverrideText: ''
  }));
}
