import { MAX_BPM, MIN_BPM } from './constants.js';
import type { SignalingBackend } from '../../signaling/factory.js';
import type { BackendState } from './ui.js';

export function backendLabel(backend: SignalingBackend): string {
  if (backend === 'mock') {
    return 'Local';
  }
  if (backend === 'supabase') {
    return 'Supabase';
  }
  return 'Ably';
}

export function formatBackendText(label: string, state: BackendState): string {
  if (state === 'connecting') {
    return `${label} connecting`;
  }
  if (state === 'error') {
    return `${label} error`;
  }
  return label;
}

export function sanitizeCode(value: string): string {
  return value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
}

export function clampBpm(value: number): number {
  return Math.max(MIN_BPM, Math.min(MAX_BPM, value));
}

export function getHostRoomCodeDisplay(roomId: string | null): string {
  return roomId ?? '------';
}
