import { MockSignaling } from './mock.js';
import { SignalingTransport } from './transport.js';
import { SupabaseConfig, SupabaseSignaling } from './supabase.js';
import { AblyConfig, AblySignaling } from './ably.js';

export type SignalingBackend = 'mock' | 'supabase' | 'ably';

export interface SignalingOptions {
  backend: SignalingBackend;
  supabase?: SupabaseConfig;
  ably?: AblyConfig;
}

export function createSignalingTransport(options: SignalingOptions): SignalingTransport {
  if (options.backend === 'supabase') {
    if (!options.supabase) {
      throw new Error('Supabase backend selected but config is missing');
    }
    return new SupabaseSignaling(options.supabase);
  }

  if (options.backend === 'ably') {
    if (!options.ably) {
      throw new Error('Ably backend selected but config is missing');
    }
    return new AblySignaling(options.ably);
  }

  return new MockSignaling();
}
