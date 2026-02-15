export interface JoinViewState {
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

export function createJoinViewState(): JoinViewState {
  return {
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
}
