import { HOST_ROOM_STORAGE_KEY, MAX_BPM, MIN_BPM, type Mode } from '../../ui/app-shell-constants.js';
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

export function formatJoinCodeVisual(code: string): string {
  const chars = code.split('');
  return Array.from({ length: 6 }, (_, i) => chars[i] ?? '_').join(' ');
}

export function getHostRoomCodeDisplay(roomId: string | null): string {
  return roomId ?? '------';
}

export function roomUrl(roomId: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?room=${roomId}`;
}

export function loadStoredHostRoomCode(): string | null {
  const stored = localStorage.getItem(HOST_ROOM_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  const normalized = stored.toUpperCase().trim();
  if (!/^[A-Z0-9]{6}$/.test(normalized)) {
    localStorage.removeItem(HOST_ROOM_STORAGE_KEY);
    return null;
  }

  return normalized;
}

export function persistHostRoomCode(code: string | null): void {
  if (code) {
    localStorage.setItem(HOST_ROOM_STORAGE_KEY, code);
  } else {
    localStorage.removeItem(HOST_ROOM_STORAGE_KEY);
  }
}

export function shouldAutoJoin(activeTab: Mode, inProgress: boolean, hasPeer: boolean, code: string): boolean {
  if (activeTab !== 'join' || inProgress || hasPeer) {
    return false;
  }

  return code.length === 6;
}
