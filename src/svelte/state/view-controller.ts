import type { JoinState } from './join.js';
import type { UiState } from './ui.js';

interface ViewControllerCallbacks {
  getUiState(): UiState;
  getJoinState(): JoinState;
  setJoinCode(code: string): void;
  setJoinClearCodeOnNextEntry(clear: boolean): void;
  maybeAutoJoin(): void;
  closeQrModal(): void;
  switchToHost(): Promise<void>;
  switchToJoin(): Promise<void>;
  onHostError(error: unknown): void;
  onJoinError(error: unknown): void;
}

export class ViewController {
  constructor(private readonly cb: ViewControllerCallbacks) {}

  onDocumentKeydown(event: KeyboardEvent): void {
    if (event.key === 'Escape' && this.cb.getUiState().qrOpen) {
      this.cb.closeQrModal();
    }
  }

  onJoinCodeKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
      this.cb.maybeAutoJoin();
      return;
    }

    const state = this.cb.getJoinState();
    if (!state.clearCodeOnNextEntry) {
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const printable = event.key.length === 1;
    if (printable) {
      this.cb.setJoinCode('');
      this.cb.setJoinClearCodeOnNextEntry(false);
      return;
    }

    if (event.key === 'Backspace' || event.key === 'Delete') {
      this.cb.setJoinCode('');
      this.cb.setJoinClearCodeOnNextEntry(false);
      event.preventDefault();
    }
  }

  onJoinCodePaste(event: ClipboardEvent): void {
    event.preventDefault();
    const pasted = (event.clipboardData?.getData('text') ?? '').toUpperCase();
    this.cb.setJoinClearCodeOnNextEntry(false);
    this.cb.setJoinCode(pasted);
    this.cb.maybeAutoJoin();
  }

  onHostTabClick(): void {
    if (this.cb.getUiState().activeTab === 'host') {
      return;
    }

    this.cb.switchToHost().catch((error) => {
      this.cb.onHostError(error);
    });
  }

  onJoinTabClick(): void {
    if (this.cb.getUiState().activeTab === 'join') {
      return;
    }

    this.cb.switchToJoin().catch((error) => {
      this.cb.onJoinError(error);
    });
  }
}
