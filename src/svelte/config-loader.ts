// @ts-nocheck
import {
  ABLY_CONFIG,
  ICE_CONFIG,
  SIGNALING_BACKEND,
  SUPABASE_CONFIG,
  TRANSPORT_MODE
} from '../../config.js';
import { TransportMode } from '../realtime/runtime.js';
import { SignalingOptions } from '../signaling/factory.js';

export interface LoadedConfig {
  iceConfig: typeof ICE_CONFIG;
  transportMode: TransportMode;
  signaling: SignalingOptions;
  appVersion: string;
}

type LocalConfig = {
  TRANSPORT_MODE?: TransportMode;
  SIGNALING_BACKEND?: SignalingOptions['backend'];
  SUPABASE_CONFIG?: typeof SUPABASE_CONFIG;
  ABLY_CONFIG?: typeof ABLY_CONFIG;
  APP_VERSION?: string;
};

async function loadLocalOverrides(): Promise<LocalConfig> {
  try {
    const response = await fetch('./config.local.json', { cache: 'no-store' });
    if (!response.ok) {
      return {};
    }

    return await response.json();
  } catch {
    return {};
  }
}

async function ensureSdkLoaded(backend: SignalingOptions['backend']): Promise<void> {
  const loadScript = (src: string) =>
    new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = src;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error(`Failed to load script: ${src}`));
      document.head.appendChild(script);
    });

  if (
    backend === 'supabase' &&
    typeof (window as { supabase?: unknown }).supabase === 'undefined'
  ) {
    await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2');
  }

  if (backend === 'ably' && typeof (window as { Ably?: unknown }).Ably === 'undefined') {
    try {
      await loadScript('https://cdn.ably.com/lib/ably.min-2.js');
    } catch {
      await loadScript('https://unpkg.com/ably@2/browser/static/ably.min.js');
    }
  }
}

export async function loadRuntimeConfig(): Promise<LoadedConfig> {
  const localOverrides = await loadLocalOverrides();
  const backend = localOverrides.SIGNALING_BACKEND ?? SIGNALING_BACKEND;

  await ensureSdkLoaded(backend);

  return {
    iceConfig: ICE_CONFIG,
    transportMode: localOverrides.TRANSPORT_MODE ?? TRANSPORT_MODE,
    signaling: {
      backend,
      supabase: {
        ...SUPABASE_CONFIG,
        ...(localOverrides.SUPABASE_CONFIG ?? {})
      },
      ably: {
        ...ABLY_CONFIG,
        ...(localOverrides.ABLY_CONFIG ?? {})
      }
    },
    appVersion: localOverrides.APP_VERSION || 'local'
  };
}
