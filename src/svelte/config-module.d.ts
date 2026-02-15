declare module '../../config.js' {
  export const SUPABASE_CONFIG: {
    url: string;
    anonKey: string;
  };
  export const ABLY_CONFIG: {
    key: string;
    token: string;
    clientId: string;
  };
  export const ICE_CONFIG: RTCConfiguration;
  export const TRANSPORT_MODE: 'webrtc' | 'pubsub';
  export const SIGNALING_BACKEND: 'mock' | 'supabase' | 'ably';
}
