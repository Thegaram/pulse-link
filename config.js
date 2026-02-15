/**
 * Configuration for Pulse Link
 * Transport and signaling settings
 */

export const SUPABASE_CONFIG = {
  // Replace with your Supabase project credentials
  url: '',
  anonKey: ''
};

export const ABLY_CONFIG = {
  // Use either key (server-side/trusted only) or token for browser clients
  key: '',
  token: '',
  clientId: ''
};

export const ICE_CONFIG = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun1.l.google.com:19302' }],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// Runtime transport mode:
// - 'pubsub': managed realtime messaging path (recommended)
// - 'webrtc': legacy P2P data channels
export const TRANSPORT_MODE = 'pubsub';

// Signaling backend used by selected transport runtime.
// - 'mock': BroadcastChannel (local multi-tab)
// - 'supabase': Supabase Realtime Broadcast
// - 'ably': Ably Realtime channels
export const SIGNALING_BACKEND = 'ably';
