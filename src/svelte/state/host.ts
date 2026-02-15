export interface HostViewState {
  currentRoomId: string | null;
  currentBpm: number;
  isRunning: boolean;
  status: string;
  statusOverrideUntil: number;
  statusOverrideText: string;
}

export function createHostViewState(): HostViewState {
  return {
    currentRoomId: null,
    currentBpm: 120,
    isRunning: false,
    status: 'Connected peers: 0',
    statusOverrideUntil: 0,
    statusOverrideText: ''
  };
}
