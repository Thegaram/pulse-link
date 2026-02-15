import { SignalingTransport } from '../signaling/transport.js';
import { MockSignaling } from '../signaling/mock.js';
import { IceConfig } from '../webrtc/types.js';
import { LeaderConnectionManagerLike, PeerConnectionManagerLike } from './connection-types.js';
import { LeaderConnectionManager } from '../webrtc/leader.js';
import { PeerConnectionManager } from '../webrtc/peer.js';
import { HostPubSubConnectionManager } from './pubsub-leader.js';
import { PeerPubSubConnectionManager } from './pubsub-peer.js';

export type TransportMode = 'webrtc' | 'pubsub';

export interface TransportRuntime {
  mode: TransportMode;
  createSignaling: () => SignalingTransport;
  createLeaderConnection(
    roomId: string,
    leaderId: string,
    signaling: SignalingTransport
  ): LeaderConnectionManagerLike;
  createPeerConnection(
    roomId: string,
    peerId: string,
    signaling: SignalingTransport
  ): PeerConnectionManagerLike;
}

export interface TransportRuntimeOptions {
  mode: TransportMode;
  createSignaling: () => SignalingTransport;
  iceConfig?: IceConfig;
}

export function createTransportRuntime(options: TransportRuntimeOptions): TransportRuntime {
  return {
    mode: options.mode,
    createSignaling: options.createSignaling,
    createLeaderConnection(roomId, leaderId, signaling) {
      if (options.mode === 'webrtc') {
        if (!options.iceConfig) {
          throw new Error('ICE config is required for webrtc transport mode');
        }
        return new LeaderConnectionManager(roomId, leaderId, signaling, options.iceConfig);
      }

      return new HostPubSubConnectionManager(roomId, leaderId, signaling);
    },
    createPeerConnection(roomId, peerId, signaling) {
      if (options.mode === 'webrtc') {
        if (!options.iceConfig) {
          throw new Error('ICE config is required for webrtc transport mode');
        }
        return new PeerConnectionManager(roomId, peerId, signaling, options.iceConfig);
      }

      return new PeerPubSubConnectionManager(roomId, peerId, signaling);
    }
  };
}

export function createDefaultTransportRuntime(mode: TransportMode = 'pubsub'): TransportRuntime {
  return createTransportRuntime({
    mode,
    createSignaling: () => new MockSignaling()
  });
}
