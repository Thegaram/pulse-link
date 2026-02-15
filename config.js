/**
 * Configuration for Pulse Link
 * Supabase and ICE server settings
 */

export const SUPABASE_CONFIG = {
  // Replace with your Supabase project credentials
  url: 'https://YOUR_PROJECT.supabase.co',
  anonKey: 'YOUR_ANON_KEY'
};

export const ICE_CONFIG = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ],
  iceCandidatePoolSize: 10,
  bundlePolicy: 'max-bundle',
  rtcpMuxPolicy: 'require'
};

// For local testing without Supabase, use a mock signaling transport
export const USE_MOCK_SIGNALING = true;
