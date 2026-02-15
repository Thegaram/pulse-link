import type { LeaderStateMachine } from '../../state/leader-machine.js';
import type { PeerStateMachine } from '../../state/peer-machine.js';
import type { Mode } from './constants.js';

export type BackendState = 'idle' | 'connecting' | 'ok' | 'error';

export interface ControllerCallbacks {
  getActiveTab(): Mode;
  getCurrentBpm(): number;
  getJoinCode(): string;

  getLeader(): LeaderStateMachine | null;
  setLeader(leader: LeaderStateMachine | null): void;

  getPeer(): PeerStateMachine | null;
  setPeer(peer: PeerStateMachine | null): void;

  setHostRunning(running: boolean): void;
  setHostPeerCount(peerCount: number): void;
  setJoinStatus(status: string): void;
  setJoinLiveStatus(status: string): void;
  setJoinBpm(bpm: number): void;

  setJoinInProgress(inProgress: boolean): void;
  setJoinInputDisabled(disabled: boolean): void;

  setBackendStatus(state: BackendState, detail?: string): void;

  loadStoredHostRoomCode(): string | null;
  setHostRoomCode(code: string | null): void;
  showHostTemporaryStatus(text: string): void;
  applyHostBpm(value: number): void;
  errorText(error: unknown): string;

  showJoinEntry(): void;
  showJoinLive(): void;
  enableJoinCodeReplaceOnNextEntry(): void;

  getHostBeatEl(): HTMLDivElement | null;
  getJoinBeatEl(): HTMLDivElement | null;

  focusJoinInput(): void;
}
