import { PeerStateMachine } from '../../state/peer-machine.js';
import { generatePeerId } from '../../types.js';
import { flashBeat } from '../../ui/dom.js';
import type { TransportRuntime } from '../../realtime/runtime.js';
import { TimerLifecycle } from './timer-lifecycle.js';
import type { WorkflowCallbacks } from './workflow-types.js';

const JOIN_HOST_TIMEOUT_MS = 7000;

export class JoinController {
  constructor(
    private readonly transportRuntime: TransportRuntime,
    private readonly cb: WorkflowCallbacks,
    private readonly timers: TimerLifecycle
  ) {}

  async teardownPeer(): Promise<void> {
    const peer = this.cb.getPeer();
    if (!peer) {
      return;
    }

    await peer.leaveRoom();
    this.cb.setPeer(null);
    this.timers.clearJoinTimer();
    this.cb.showJoinEntry();
    this.cb.setJoinStatus('Enter a room code to join.');
    this.cb.setBackendStatus('idle');
  }

  prepareJoinMode(): void {
    this.cb.setJoinStatus('Enter a room code to join.');
    this.cb.enableJoinCodeReplaceOnNextEntry();
    this.cb.showJoinEntry();
    this.cb.focusJoinInput();
  }

  async joinRoom(roomId: string): Promise<void> {
    await this.teardownPeer();
    this.cb.setJoinStatus('Joining room...');
    this.cb.setBackendStatus('connecting');
    this.timers.clearJoinHostTimeout();
    this.cb.setJoinInProgress(true);
    this.cb.setJoinInputDisabled(true);

    const peer = new PeerStateMachine(generatePeerId(), this.transportRuntime);
    peer.getMetronome().onBeatScheduled((_, isDownbeat) => {
      const node = this.cb.getJoinBeatEl();
      if (node) {
        flashBeat(node, isDownbeat);
      }
    });

    peer.onStart(() => {
      this.timers.clearJoinHostTimeout();
      this.cb.showJoinLive();
      this.cb.setJoinLiveStatus('Running.');

      this.cb.setJoinBpm(peer.getMetronome().getBPM());
      this.timers.setJoinTimer(() => {
        if (this.cb.getPeer()) {
          this.cb.setJoinBpm(peer.getMetronome().getBPM());
        }
      }, 300);
    });

    peer.onSyncStatus((status) => {
      this.timers.clearJoinHostTimeout();
      this.cb.setBackendStatus('ok');
      this.cb.showJoinLive();
      this.cb.setJoinLiveStatus(status);
    });

    await peer.joinRoom(roomId);
    this.cb.setPeer(peer);
    this.cb.setJoinStatus('Waiting for host...');
    this.timers.setJoinHostTimeout(() => {
      const currentPeer = this.cb.getPeer();
      if (!currentPeer) {
        return;
      }

      const state = currentPeer.getState();
      if (state === 'C_DISCOVERING' || state === 'C_SIGNALING') {
        this.teardownPeer()
          .then(() => {
            this.cb.setJoinStatus('Host not found. Try another code.');
            this.cb.enableJoinCodeReplaceOnNextEntry();
            this.cb.setBackendStatus('error', 'No host responded for this room code');
          })
          .catch((error) => {
            console.error(error);
            this.cb.setJoinStatus('Host not found. Try another code.');
            this.cb.enableJoinCodeReplaceOnNextEntry();
            this.cb.setBackendStatus('error', this.cb.errorText(error));
          });
      }
    }, JOIN_HOST_TIMEOUT_MS);

    this.cb.setJoinInProgress(false);
  }

  maybeAutoJoin(): void {
    const code = this.cb.getJoinCode();
    if (code.length !== 6 || this.cb.getPeer()) {
      return;
    }

    this.joinRoom(code).catch((error) => {
      console.error(error);
      this.cb.setJoinInProgress(false);
      this.cb.setJoinInputDisabled(false);
      this.cb.setJoinStatus('Join failed. Try another code.');
      this.cb.enableJoinCodeReplaceOnNextEntry();
      this.cb.showJoinEntry();
      this.cb.setBackendStatus('error', this.cb.errorText(error));
    });
  }
}

