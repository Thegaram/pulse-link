/**
 * Leader WebRTC connection manager
 * Handles P2P connections to multiple peers in star topology
 */

import { SignalingTransport } from '../signaling/transport.js';
import { Message, createMessage } from '../types.js';
import { IceConfig, DataChannelPair, DataChannelMessageHandler } from './types.js';
import { createDataChannels, setupChannelHandlers, sendOnChannel } from './channels.js';

interface PeerConnection {
  peerId: string;
  pc: RTCPeerConnection;
  channels: DataChannelPair;
  connected: boolean;
}

export class LeaderConnectionManager {
  private peers: Map<string, PeerConnection> = new Map();
  private roomId: string;
  private leaderId: string;

  private onTimeSyncMessage: DataChannelMessageHandler | null = null;
  private onControlMessage: DataChannelMessageHandler | null = null;

  constructor(
    roomId: string,
    leaderId: string,
    private signaling: SignalingTransport,
    private iceConfig: IceConfig
  ) {
    this.roomId = roomId;
    this.leaderId = leaderId;

    // Listen for signaling messages
    this.signaling.onMessage((message) => this.handleSignalingMessage(message));
  }

  /**
   * Handle incoming signaling messages
   */
  private async handleSignalingMessage(message: Message): Promise<void> {
    const { type, from, payload } = message;

    switch (type) {
      case 'join':
        await this.handlePeerJoin(from);
        break;

      case 'answer':
        await this.handleAnswer(from, payload.sdp);
        break;

      case 'ice':
        await this.handleIceCandidate(from, payload);
        break;
    }
  }

  /**
   * Handle peer join request
   */
  private async handlePeerJoin(peerId: string): Promise<void> {
    console.log(`👤 Peer joined: ${peerId}`);

    // Send leader hello
    const helloMsg = createMessage(
      this.roomId,
      this.leaderId,
      peerId,
      'leader_hello',
      { leaderId: this.leaderId }
    );
    await this.signaling.send(helloMsg);

    // Create peer connection
    await this.createPeerConnection(peerId);
  }

  /**
   * Create WebRTC connection to a peer
   */
  private async createPeerConnection(peerId: string): Promise<void> {
    const pc = new RTCPeerConnection(this.iceConfig);

    // Create DataChannels BEFORE creating offer (leader initiates)
    const channels = createDataChannels(pc);

    // Setup channel handlers
    setupChannelHandlers(
      channels.timeSync,
      (data) => this.handleTimeSyncMessage(peerId, data),
      () => console.log(`✅ Time-sync channel open: ${peerId}`)
    );

    setupChannelHandlers(
      channels.control,
      (data) => this.handleControlMessage(peerId, data),
      () => {
        console.log(`✅ Control channel open: ${peerId}`);
        this.markPeerConnected(peerId);
      }
    );

    // Handle ICE candidates
    pc.onicecandidate = (event) => {
      if (event.candidate) {
        this.sendIceCandidate(peerId, event.candidate);
      }
    };

    // Track connection state
    pc.onconnectionstatechange = () => {
      console.log(`🔗 Connection state (${peerId}): ${pc.connectionState}`);

      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        this.handlePeerDisconnect(peerId);
      }
    };

    // Store peer connection
    this.peers.set(peerId, {
      peerId,
      pc,
      channels,
      connected: false
    });

    // Create and send offer
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    const offerMsg = createMessage(
      this.roomId,
      this.leaderId,
      peerId,
      'offer',
      { sdp: offer.sdp }
    );
    await this.signaling.send(offerMsg);

    console.log(`📤 Sent offer to ${peerId}`);
  }

  /**
   * Handle answer from peer
   */
  private async handleAnswer(peerId: string, sdp: string): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      console.error(`No peer connection for ${peerId}`);
      return;
    }

    const answer = new RTCSessionDescription({ type: 'answer', sdp });
    await peer.pc.setRemoteDescription(answer);

    console.log(`📥 Received answer from ${peerId}`);
  }

  /**
   * Handle ICE candidate from peer
   */
  private async handleIceCandidate(peerId: string, candidateData: any): Promise<void> {
    const peer = this.peers.get(peerId);
    if (!peer) {
      return;
    }

    const candidate = new RTCIceCandidate({
      candidate: candidateData.candidate,
      sdpMid: candidateData.sdpMid,
      sdpMLineIndex: candidateData.sdpMLineIndex
    });

    await peer.pc.addIceCandidate(candidate);
  }

  /**
   * Send ICE candidate to peer
   */
  private async sendIceCandidate(peerId: string, candidate: RTCIceCandidate): Promise<void> {
    const iceMsg = createMessage(
      this.roomId,
      this.leaderId,
      peerId,
      'ice',
      {
        candidate: candidate.candidate,
        sdpMid: candidate.sdpMid,
        sdpMLineIndex: candidate.sdpMLineIndex
      }
    );

    await this.signaling.send(iceMsg);
  }

  /**
   * Mark peer as connected (both channels open)
   */
  private markPeerConnected(peerId: string): void {
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connected = true;
      console.log(`✅ Peer fully connected: ${peerId}`);
    }
  }

  /**
   * Handle peer disconnect
   */
  private handlePeerDisconnect(peerId: string): void {
    console.log(`❌ Peer disconnected: ${peerId}`);
    const peer = this.peers.get(peerId);
    if (peer) {
      peer.connected = false;
    }
  }

  /**
   * Handle time-sync channel message from peer
   */
  private handleTimeSyncMessage(peerId: string, data: any): void {
    if (this.onTimeSyncMessage) {
      this.onTimeSyncMessage({ peerId, ...data });
    }
  }

  /**
   * Handle control channel message from peer
   */
  private handleControlMessage(peerId: string, data: any): void {
    if (this.onControlMessage) {
      this.onControlMessage({ peerId, ...data });
    }
  }

  /**
   * Register handler for time-sync messages from peers
   */
  onTimeSync(handler: DataChannelMessageHandler): void {
    this.onTimeSyncMessage = handler;
  }

  /**
   * Register handler for control messages from peers
   */
  onControl(handler: DataChannelMessageHandler): void {
    this.onControlMessage = handler;
  }

  /**
   * Send message on time-sync channel to specific peer
   */
  sendTimeSync(peerId: string, data: any): void {
    const peer = this.peers.get(peerId);
    if (peer && peer.connected) {
      sendOnChannel(peer.channels.timeSync, data);
    }
  }

  /**
   * Send message on control channel to specific peer
   */
  sendControl(peerId: string, data: any): void {
    const peer = this.peers.get(peerId);
    if (peer && peer.connected) {
      sendOnChannel(peer.channels.control, data);
    }
  }

  /**
   * Broadcast message on control channel to all connected peers
   */
  broadcastControl(data: any): void {
    for (const peer of this.peers.values()) {
      if (peer.connected) {
        sendOnChannel(peer.channels.control, data);
      }
    }
  }

  /**
   * Get list of connected peer IDs
   */
  getConnectedPeers(): string[] {
    return Array.from(this.peers.values())
      .filter(p => p.connected)
      .map(p => p.peerId);
  }

  /**
   * Close all connections
   */
  async closeAll(): Promise<void> {
    for (const peer of this.peers.values()) {
      peer.pc.close();
    }
    this.peers.clear();

    await this.signaling.disconnect();
  }
}
