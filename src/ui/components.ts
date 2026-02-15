/**
 * Reusable UI component helpers
 */

/**
 * Show/hide element
 */
export function show(element: HTMLElement): void {
  element.style.display = 'block';
}

export function hide(element: HTMLElement): void {
  element.style.display = 'none';
}

/**
 * Set element text content
 */
export function setText(element: HTMLElement, text: string): void {
  element.textContent = text;
}

/**
 * Add event listener helper
 */
export function onClick(element: HTMLElement, handler: () => void): void {
  element.addEventListener('click', handler);
}

/**
 * Create QR code URL for room
 */
export function getRoomUrl(roomId: string): string {
  const baseUrl = window.location.origin + window.location.pathname;
  return `${baseUrl}?room=${roomId}`;
}

/**
 * Parse room ID from URL
 */
export function getRoomIdFromUrl(): string | null {
  const params = new URLSearchParams(window.location.search);
  return params.get('room');
}

/**
 * Format BPM display
 */
export function formatBPM(bpm: number): string {
  return bpm.toString();
}

/**
 * Create simple visual feedback element
 */
export function createBeatIndicator(): HTMLElement {
  const indicator = document.createElement('div');
  indicator.className = 'beat-indicator';
  return indicator;
}

/**
 * Flash beat indicator
 */
export function flashBeatIndicator(indicator: HTMLElement, isDownbeat: boolean = false): void {
  indicator.classList.remove('flash', 'downbeat-flash');
  void indicator.offsetWidth; // Force reflow
  indicator.classList.add(isDownbeat ? 'downbeat-flash' : 'flash');
}
