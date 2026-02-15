import { HOST_ROOM_STORAGE_KEY } from '../../ui/app-shell-constants.js';
import { sanitizeCode } from '../state/runtime-ops.js';

declare const QRCode: {
  new (element: HTMLElement, options: {
    text: string;
    width: number;
    height: number;
    colorDark: string;
    colorLight: string;
  }): unknown;
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

export function readSharedRoomCodeFromUrl(): string | null {
  const code = new URLSearchParams(window.location.search).get('room');
  if (!code) {
    return null;
  }
  const normalized = sanitizeCode(code);
  return normalized.length === 6 ? normalized : null;
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

