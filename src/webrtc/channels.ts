/**
 * Dual DataChannel setup for WebRTC connections
 *
 * Channel 1 (time-sync): Unordered, unreliable, low-latency for ping/pong
 * Channel 2 (control): Ordered, reliable for state updates
 */

import { DataChannelPair, DataChannelMessageHandler } from './types.js';

/**
 * Create dual DataChannels on a peer connection (leader side)
 */
export function createDataChannels(pc: RTCPeerConnection): DataChannelPair {
  // Channel 1: Time sync (low latency, fire-and-forget)
  const timeSync = pc.createDataChannel('time-sync', {
    ordered: false,
    maxRetransmits: 0
  });

  // Channel 2: Control (reliable, ordered)
  const control = pc.createDataChannel('control', {
    ordered: true
    // Default: reliable (maxRetransmits: unlimited)
  });

  return { timeSync, control };
}

/**
 * Setup DataChannel event handlers
 */
export function setupChannelHandlers(
  channel: RTCDataChannel,
  onMessage: DataChannelMessageHandler,
  onOpen?: () => void,
  onClose?: () => void
): void {
  channel.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (err) {
      console.error('Failed to parse DataChannel message:', err);
    }
  };

  if (onOpen) {
    channel.onopen = onOpen;
  }

  if (onClose) {
    channel.onclose = onClose;
  }

  channel.onerror = (error) => {
    console.error('DataChannel error:', error);
  };
}

/**
 * Send message on a DataChannel
 */
export function sendOnChannel(channel: RTCDataChannel, data: any): void {
  if (channel.readyState !== 'open') {
    console.warn('DataChannel not open, dropping message');
    return;
  }

  try {
    channel.send(JSON.stringify(data));
  } catch (err) {
    console.error('Failed to send on DataChannel:', err);
  }
}

/**
 * Wait for DataChannel to open (with timeout)
 */
export function waitForChannelOpen(
  channel: RTCDataChannel,
  timeoutMs: number = 5000
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (channel.readyState === 'open') {
      resolve();
      return;
    }

    const timeout = setTimeout(() => {
      reject(new Error('DataChannel open timeout'));
    }, timeoutMs);

    channel.onopen = () => {
      clearTimeout(timeout);
      resolve();
    };

    channel.onerror = (error) => {
      clearTimeout(timeout);
      reject(error);
    };
  });
}
