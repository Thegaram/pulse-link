/**
 * Main UI controller and routing
 */

import { LeaderStateMachine } from '../state/leader-machine.js';
import { PeerStateMachine } from '../state/peer-machine.js';
import { generatePeerId } from '../types.js';
import { IceConfig } from '../webrtc/types.js';
import { show, hide, getRoomIdFromUrl } from './components.js';

export class App {
  private myId: string;
  private role: 'leader' | 'peer' | null = null;
  private leaderMachine: LeaderStateMachine | null = null;
  private peerMachine: PeerStateMachine | null = null;

  // Views
  private homeView: HTMLElement;
  private createView: HTMLElement;
  private joinView: HTMLElement;
  private playingView: HTMLElement;

  constructor(private iceConfig: IceConfig) {
    this.myId = generatePeerId();

    // Get view elements
    this.homeView = document.getElementById('homeView')!;
    this.createView = document.getElementById('createView')!;
    this.joinView = document.getElementById('joinView')!;
    this.playingView = document.getElementById('playingView')!;

    this.init();
  }

  private init(): void {
    // Check if room ID in URL (auto-join)
    const roomId = getRoomIdFromUrl();
    if (roomId) {
      this.showJoinView(roomId);
    } else {
      this.showHomeView();
    }

    // Setup navigation
    this.setupNavigation();
  }

  private setupNavigation(): void {
    // Home view buttons
    const createRoomBtn = document.getElementById('createRoomBtn');
    const joinRoomBtn = document.getElementById('joinRoomBtn');

    if (createRoomBtn) {
      createRoomBtn.addEventListener('click', () => this.showCreateView());
    }

    if (joinRoomBtn) {
      joinRoomBtn.addEventListener('click', () => this.showJoinView());
    }
  }

  private showHomeView(): void {
    hide(this.createView);
    hide(this.joinView);
    hide(this.playingView);
    show(this.homeView);
  }

  private showCreateView(): void {
    hide(this.homeView);
    hide(this.joinView);
    hide(this.playingView);
    show(this.createView);

    this.role = 'leader';
    this.leaderMachine = new LeaderStateMachine(this.myId);
  }

  private showJoinView(roomId?: string): void {
    hide(this.homeView);
    hide(this.createView);
    hide(this.playingView);
    show(this.joinView);

    this.role = 'peer';
    this.peerMachine = new PeerStateMachine(this.myId);

    // If room ID provided, auto-fill
    if (roomId) {
      const roomInput = document.getElementById('roomIdInput') as HTMLInputElement;
      if (roomInput) {
        roomInput.value = roomId;
      }
    }
  }

  showPlayingView(): void {
    hide(this.homeView);
    hide(this.createView);
    hide(this.joinView);
    show(this.playingView);
  }

  getRole(): 'leader' | 'peer' | null {
    return this.role;
  }

  getLeaderMachine(): LeaderStateMachine | null {
    return this.leaderMachine;
  }

  getPeerMachine(): PeerStateMachine | null {
    return this.peerMachine;
  }

  getIceConfig(): IceConfig {
    return this.iceConfig;
  }
}
