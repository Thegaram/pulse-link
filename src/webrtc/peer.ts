/**
 * Peer WebRTC connection manager
 * Handles P2P connection to the leader
 */

import { SignalingTransport } from '../signaling/transport.js';
import { Message, createMessage } from '../types.js';
import { IceConfig, DataChannelPair, DataChannelMessageHandler } from './types.js';
import { setupChannelHandlers, sendOnChannel } from './channels.js';

export class PeerConnectionManager {
  private pc: RTCPeerConnection | null = null;
  private channels: DataChannelPair | null = null;
  private leaderId: string = '';
  private connected: boolean = false;

  private onTimeSyncMessage: DataChannelMessageHandler | null = null;
  private onControlMessage: DataChannelMessageHandler | null = null;
  private onConnectedCallback: (() => void) | null = null;

  constructor(
    private roomId: string,
    private peerId: string,
    private signaling: SignalingTransport,
    private iceConfig: IceConfig
  ) {
    // Listen for signaling messages
    this.signaling.onMessage((message) => this.handleSignalingMessage(message));
  }

  /**
   * Join room and initiate connection
   */
  async joinRoom(): Promise<void> {
    // Send join message to signaling channel
    const joinMsg = createMessage(this.roomId, this.peerId, '*', 'join', { peerId: this.peerId });

    await this.signaling.send(joinMsg);
    console.log(`📤 Sent join request for room: ${this.roomId}`);
  }

  /**
   * Handle incoming signaling messages
   */
  private async handleSignalingMessage(message: Message): Promise<void> {
    const { type, from, payload } = message;

    switch (type) {
      case 'leader_hello':
        this.leaderId = from;
        console.log(`👋 Leader hello from: ${from}`);
        break;

      case 'offer':
        await this.handleOffer(from, payload.sdp);
        break;

      case 'ice':
        await this.handleIceCandidate(payload);
        break;
    }
  }

  /**
   * Handle offer from leader
   */
  private async handleOffer(leaderId: string, sdp: string): Promise<void> {
    this.leaderId = leaderId;
    console.log(`📥 Received offer from leader: ${leaderId}`);

    // Create peer connection
    this.pc = new RTCPeerConnection(this.iceConfig);

    // Handle ICE candidates
    this.pc.onicecandidate = (event) => {
      if (event.candidate) {
        console.log(`🧊 ICE candidate (peer → leader):`, event.candidate.candidate);
        this.sendIceCandidate(event.candidate);
      } else {
        console.log(`🧊 ICE gathering complete`);
      }
    };

    // Handle incoming DataChannels (leader creates them)
    this.pc.ondatachannel = (event) => {
      this.handleIncomingChannel(event.channel);
    };

    // Track connection state
    this.pc.onconnectionstatechange = () => {
      console.log(`🔗 Connection state: ${this.pc?.connectionState}`);

      if (this.pc?.connectionState === 'connected' && this.connected) {
        if (this.onConnectedCallback) {
          this.onConnectedCallback();
        }
      }

      if (this.pc?.connectionState === 'disconnected' || this.pc?.connectionState === 'failed') {
        this.handleDisconnect();
      }
    };

    // Track ICE connection state for debugging
    this.pc.oniceconnectionstatechange = () => {
      console.log(`🧊 ICE connection state: ${this.pc?.iceConnectionState}`);

      if (this.pc?.iceConnectionState === 'failed') {
        console.error(`❌ ICE connection failed.`);
        console.error(`💡 If testing in same browser tabs, disable Chrome mDNS:`);
        console.error(`   chrome://flags/#enable-webrtc-hide-local-ips-with-mdns → Disabled`);
      }
    };

    // Track ICE gathering state
    this.pc.onicegatheringstatechange = () => {
      console.log(`🧊 ICE gathering state: ${this.pc?.iceGatheringState}`);
    };

    // Set remote description (offer)
    const offer = new RTCSessionDescription({ type: 'offer', sdp });
    await this.pc.setRemoteDescription(offer);

    // Create and send answer
    const answer = await this.pc.createAnswer();
    await this.pc.setLocalDescription(answer);

    const answerMsg = createMessage(this.roomId, this.peerId, leaderId, 'answer', {
      sdp: answer.sdp
    });
    await this.signaling.send(answerMsg);

    console.log(`📤 Sent answer to leader`);
  }

  /**
   * Handle incoming DataChannel
   */
  private handleIncomingChannel(channel: RTCDataChannel): void {
    console.log(`📡 Incoming DataChannel: ${channel.label}`);

    if (channel.label === 'time-sync') {
      if (!this.channels) {
        this.channels = { timeSync: channel, control: null as any };
      } else {
        this.channels.timeSync = channel;
      }

      setupChannelHandlers(
        channel,
        (data) => this.handleTimeSyncMessage(data),
        () => console.log('✅ Time-sync channel open'),
        () => console.log('❌ Time-sync channel closed')
      );
    } else if (channel.label === 'control') {
      if (!this.channels) {
        this.channels = { timeSync: null as any, control: channel };
      } else {
        this.channels.control = channel;
      }

      setupChannelHandlers(
        channel,
        (data) => this.handleControlMessage(data),
        () => {
          console.log('✅ Control channel open');
          this.markConnected();
        },
        () => console.log('❌ Control channel closed')
      );
    }
  }

  /**
   * Handle ICE candidate from leader
   */
  private async handleIceCandidate(candidateData: any): Promise<void> {
    if (!this.pc) {
      console.warn(`⚠️ ICE candidate received but no peer connection`);
      return;
    }

    console.log(`🧊 Received ICE candidate from leader:`, candidateData.candidate);

    const candidate = new RTCIceCandidate({
      candidate: candidateData.candidate,
      sdpMid: candidateData.sdpMid,
      sdpMLineIndex: candidateData.sdpMLineIndex
    });

    try {
      await this.pc.addIceCandidate(candidate);
      console.log(`✅ Added ICE candidate`);
    } catch (err) {
      console.error(`❌ Failed to add ICE candidate:`, err);
    }
  }

  /**
   * Send ICE candidate to leader
   */
  private async sendIceCandidate(candidate: RTCIceCandidate): Promise<void> {
    const iceMsg = createMessage(this.roomId, this.peerId, this.leaderId, 'ice', {
      candidate: candidate.candidate,
      sdpMid: candidate.sdpMid,
      sdpMLineIndex: candidate.sdpMLineIndex
    });

    await this.signaling.send(iceMsg);
  }

  /**
   * Mark connection as established
   */
  private markConnected(): void {
    this.connected = true;
    console.log('✅ Peer fully connected to leader');

    // Notify callback
    if (this.onConnectedCallback) {
      this.onConnectedCallback();
    }
  }

  /**
   * Handle disconnect from leader
   */
  private handleDisconnect(): void {
    console.log('❌ Disconnected from leader');
    this.connected = false;
  }

  /**
   * Handle time-sync message from leader
   */
  private handleTimeSyncMessage(data: any): void {
    if (this.onTimeSyncMessage) {
      this.onTimeSyncMessage(data);
    }
  }

  /**
   * Handle control message from leader
   */
  private handleControlMessage(data: any): void {
    if (this.onControlMessage) {
      this.onControlMessage(data);
    }
  }

  /**
   * Register handler for time-sync messages
   */
  onTimeSync(handler: DataChannelMessageHandler): void {
    this.onTimeSyncMessage = handler;
  }

  /**
   * Register handler for control messages
   */
  onControl(handler: DataChannelMessageHandler): void {
    this.onControlMessage = handler;
  }

  /**
   * Register handler for successful connection
   */
  onConnected(callback: () => void): void {
    this.onConnectedCallback = callback;
  }

  /**
   * Send message on time-sync channel (respond to pings immediately)
   */
  sendTimeSync(data: any): void {
    if (this.channels && this.connected) {
      sendOnChannel(this.channels.timeSync, data);
    }
  }

  /**
   * Send message on control channel
   */
  sendControl(data: any): void {
    if (this.channels && this.connected) {
      sendOnChannel(this.channels.control, data);
    }
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.connected;
  }

  /**
   * Close connection
   */
  async close(): Promise<void> {
    if (this.pc) {
      this.pc.close();
      this.pc = null;
    }

    this.channels = null;
    this.connected = false;

    await this.signaling.disconnect();
  }
}
