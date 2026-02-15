import { HOST_ROOM_STORAGE_KEY, HOST_SESSION_STORAGE_KEY } from '../state/constants.js';
import { sanitizeCode } from '../state/runtime-ops.js';

declare const QRCode: {
  new (
    element: HTMLElement,
    options: {
      text: string;
      width: number;
      height: number;
      colorDark: string;
      colorLight: string;
    }
  ): unknown;
};

export function loadStoredHostRoomCode(): string | null {
  const stored = localStorage.getItem(HOST_ROOM_STORAGE_KEY);
  if (!stored) {
    return null;
  }

  const normalized = sanitizeCode(stored);
  if (normalized.length !== 6) {
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

export interface PersistedHostSession {
  roomId: string;
  bpm: number;
  running: boolean;
  anchorEpochMs?: number;
  beatIndexAtAnchor?: number;
}

function isValidPersistedHostSession(value: unknown): value is PersistedHostSession {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const session = value as Record<string, unknown>;
  if (typeof session.roomId !== 'string' || sanitizeCode(session.roomId).length !== 6) {
    return false;
  }
  if (typeof session.bpm !== 'number' || !Number.isFinite(session.bpm)) {
    return false;
  }
  if (typeof session.running !== 'boolean') {
    return false;
  }
  if (
    session.anchorEpochMs !== undefined &&
    (typeof session.anchorEpochMs !== 'number' || !Number.isFinite(session.anchorEpochMs))
  ) {
    return false;
  }
  if (
    session.beatIndexAtAnchor !== undefined &&
    (typeof session.beatIndexAtAnchor !== 'number' || !Number.isFinite(session.beatIndexAtAnchor))
  ) {
    return false;
  }

  return true;
}

export function loadPersistedHostSession(roomId: string): PersistedHostSession | null {
  const raw = localStorage.getItem(HOST_SESSION_STORAGE_KEY);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isValidPersistedHostSession(parsed)) {
      localStorage.removeItem(HOST_SESSION_STORAGE_KEY);
      return null;
    }

    const normalizedRoomId = sanitizeCode(parsed.roomId);
    if (normalizedRoomId !== sanitizeCode(roomId)) {
      return null;
    }

    return {
      roomId: normalizedRoomId,
      bpm: parsed.bpm,
      running: parsed.running,
      anchorEpochMs: parsed.anchorEpochMs,
      beatIndexAtAnchor: parsed.beatIndexAtAnchor
    };
  } catch {
    localStorage.removeItem(HOST_SESSION_STORAGE_KEY);
    return null;
  }
}

export function persistHostSession(session: PersistedHostSession): void {
  localStorage.setItem(HOST_SESSION_STORAGE_KEY, JSON.stringify(session));
}

export function readSharedRoomCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('room');
  if (!code) {
    return null;
  }
  const normalized = sanitizeCode(code);
  return normalized.length === 6 ? normalized : null;
}

export function setRoomCodeInUrl(roomCode: string | null): void {
  const url = new URL(window.location.href);
  if (roomCode) {
    url.searchParams.set('room', roomCode);
  } else {
    url.searchParams.delete('room');
  }
  window.history.replaceState({}, '', url.toString());
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

export function buildRoomUrl(roomCode: string): string {
  const base = `${window.location.origin}${window.location.pathname}`;
  return `${base}?room=${roomCode}`;
}

export function renderQrCode(
  node: HTMLElement,
  roomCode: string,
  options = {
    width: 220,
    height: 220,
    colorDark: '#111111',
    colorLight: '#ffffff'
  }
): void {
  node.innerHTML = '';
  new QRCode(node, {
    text: buildRoomUrl(roomCode),
    width: options.width,
    height: options.height,
    colorDark: options.colorDark,
    colorLight: options.colorLight
  });
}
