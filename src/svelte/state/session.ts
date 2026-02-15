import { writable } from 'svelte/store';
import type { LeaderStateMachine } from '../../state/leader-machine.js';
import type { PeerStateMachine } from '../../state/peer-machine.js';

export interface SessionState {
  leader: LeaderStateMachine | null;
  peer: PeerStateMachine | null;
}

const initialSessionState: SessionState = {
  leader: null,
  peer: null
};

const { subscribe, update } = writable<SessionState>(initialSessionState);

export const sessionState = { subscribe };

export function setLeader(leader: LeaderStateMachine | null): void {
  update((state) => ({ ...state, leader }));
}

export function setPeer(peer: PeerStateMachine | null): void {
  update((state) => ({ ...state, peer }));
}

export function clearSessionState(): void {
  update(() => ({ ...initialSessionState }));
}

