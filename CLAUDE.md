# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Pulse Link is a phone-first P2P WebRTC metronome app that synchronizes a shared beat grid across multiple musicians using their own devices. The architecture is leader-authoritative with ephemeral room state.

## Core Architecture

### Topology & Lifetime

- **Star topology**: Leader connects to each peer individually (not mesh)
- **Leader-owned state**: All room state lives on leader's device
- **Room lifetime**: Room closes when leader leaves (no host migration in V1)
- **Ephemeral**: No server-side persistence of room state

### Key Components (as designed in README.md:181-191)

- **SignalingTransport** (`signaling/transport.ts`, `signaling/supabase.ts`): Abstraction for WebRTC signaling via Supabase Realtime Broadcast (used only for initial connection setup)
- **WebRTC Manager** (`webrtc/leader.ts`, `webrtc/peer.ts`): Handles P2P DataChannel connections after signaling
- **Sync Engine** (`sync/clock.ts`): Ping/pong time offset estimation and drift correction
- **Metronome Engine** (`audio/metronome.ts`): Web Audio API lookahead scheduler (0.5s lookahead, 50-100ms refill rate)
- **State Machines** (`state/leaderMachine.ts`, `state/peerMachine.ts`): Leader (L_IDLE → L_ROOM_OPEN → L_RUNNING → L_CLOSING) and Peer (C_IDLE → C_DISCOVERING → C_SIGNALING → C_CONNECTING → C_SYNCING → C_RUNNING)
- **UI Layer** (`ui/`): Create/Join/Playing views

### Message Protocol

All messages follow the envelope structure (README.md:76-97):

```typescript
type Msg = {
  v: 1;
  roomId: string;
  from: string;
  to: string | '*'; // "*" for broadcast
  type:
    | 'join'
    | 'leader_hello'
    | 'offer'
    | 'answer'
    | 'ice'
    | 'start_announce'
    | 'time_ping'
    | 'time_pong'
    | 'param_update'
    | 'room_closed';
  ts: number;
  payload: any;
};
```

### Time Synchronization

Uses ping/pong protocol (README.md:118-143):

1. Leader sends `time_ping` with `t1LeaderMs`
2. Peer responds immediately with `time_pong` containing `t1LeaderMs`, `t2PeerMs` (receive), `t3PeerMs` (send)
3. Offset estimated from best RTT sample
4. Metronome converts leader anchor time to peer time using offset, then to AudioContext time
5. Micro-corrections applied when phase error > 20ms

### Beat Grid Synchronization

Leader announces beat grid anchor (README.md:101-114):

- `bpm`: Tempo
- `version`: State version number
- `anchorLeaderMs`: Timestamp in leader's clock
- `beatIndexAtAnchor`: Absolute beat number at anchor time

Peers use offset to convert leader anchor to their local time, then schedule clicks in Web Audio API.

## Default Product Decisions (README.md:35-44)

1. **Start behavior**: 5-second countdown by default
2. **Control channel**: WebRTC DataChannel (not signaling server after initial connection)
3. **Update semantics**: Future downbeat anchor to avoid abrupt tempo jumps
4. **TURN policy**: STUN first, TURN fallback on retry
5. **Audio constraint**: Screen must stay on (use Wake Lock API when supported)

## Implementation Constraints

- **iOS background audio limitations**: Web Audio API may suspend when screen locks
- **TURN required on restrictive networks**: Not all peers can connect via STUN alone
- **Bluetooth latency**: Device-dependent and cannot be fully compensated in software
- **Wake Lock dependency**: Required to keep metronome running reliably

## Room State Model

```typescript
type RoomState = {
  roomId: string;
  leaderId: string;
  bpm: number;
  version: number;
  status: 'open' | 'countdown' | 'running' | 'closed';
  startAtLeaderMs?: number;
  peers: Record<string, PeerConnState>;
};
```

Leader maintains authoritative state. Peers receive updates via DataChannel messages. Room is self-healing via periodic leader announcements.

## V2 Planned Features (README.md:26-31)

- Synced BPM/start/stop/accent updates
- Participant count and roles
- Improved drift correction metrics
- Optional host migration
