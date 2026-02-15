# Pulse Link - Shared Metronome (P2P, WebRTC)

A web-first app that lets a group of musicians hear the same metronome phase synchronized across devices.

**Stack:**
-   Svelte + Vite frontend shell
-   TypeScript sync/audio/state core modules
-   Managed realtime pub/sub signaling (Ably or Supabase) with local mock option
-   Optional legacy WebRTC transport mode

**Browser Support:**
-   Desktop: Chrome, Firefox, Safari, Edge (full support)
-   Mobile: Android Chrome (full support)
-   iOS Safari: Limited (Web Audio suspends on screen lock, no Wake Lock API)

------------------------------------------------------------------------

## Development

### Quick Start
```bash
# Install deps
npm install

# Local development
npm run dev

# Open http://localhost:8000
```

### Transport Mode
- Configure runtime transport in `config.js`.
- Default is `TRANSPORT_MODE = 'pubsub'` with `SIGNALING_BACKEND = 'mock'` for local multi-tab testing.
- To use managed Supabase pub/sub, set `SIGNALING_BACKEND = 'supabase'` and fill `SUPABASE_CONFIG`.
- To use managed Ably pub/sub, set `SIGNALING_BACKEND = 'ably'` and fill `ABLY_CONFIG`.
- SDK loading for Supabase/Ably is handled in `index.html` based on backend choice.

### Local Secrets
- Keep committed `config.js` generic; put local keys/tokens in `.env` (ignored by git).
- Running `npm run dev` or `npm run build` automatically generates `config.local.json` from `.env`.
- `config.local.json` is ignored by git and auto-loaded by `index.html` at runtime.
- Template env file: `.env.example`.

### Deployment
- Commit to `main` branch
- Build with `npm run build`
- Deploy `dist/` to static hosting

### Testing Time Sync
1. Open same room in multiple browser windows/devices
2. Use browser DevTools Performance API to verify sync accuracy
3. Check `performance.now()` deltas between scheduled vs actual clicks

------------------------------------------------------------------------

## Goals

### V1 (Static Web App)

-   Leader creates a room with BPM and start countdown
-   Room shows QR code; others scan and join
-   Everyone plays a metronome aligned to the same beat grid (phase-aligned)
-   Minimal, dark, mobile-responsive UI
-   Ephemeral, leader-owned room state (no server persistence)
-   Works best on desktop and Android; iOS requires screen-on

### V2 (Planned)

-   Synced updates: BPM / start / stop / accents
-   Participant count + roles
-   Improved drift correction with Kalman filtering
-   Leader reconnection grace period (30s)
-   Manual latency compensation for Bluetooth earbuds
-   Native mobile app wrapper for iOS background audio

------------------------------------------------------------------------

## Default Product Decisions

1.  **Topology**: Star (leader connects to each peer, max 10 peers for mobile reliability)
2.  **Room lifetime**: Ends when leader leaves (no host migration in V1)
3.  **Start behavior**: Default 5-second countdown
4.  **Control channel**: Dual WebRTC DataChannels
    - Channel 1 (time sync): Unordered, unreliable, low-latency for ping/pong
    - Channel 2 (control): Ordered, reliable for state updates
5.  **Update semantics**: Future downbeat anchor (smooth tempo changes, no abrupt jumps)
6.  **TURN policy**: STUN first, show reconnect with TURN on failure
7.  **Time sync**: Continuous ping/pong every 1-2s during playback with median RTT filtering
8.  **Phase correction**: Gradual tempo adjustment over 1 beat (not instant jumps)
9.  **Clock precision**: Use `performance.now()` for sub-millisecond accuracy, not `Date.now()`
10. **Screen-on requirement**: Display warning on mobile (Wake Lock API where supported)

------------------------------------------------------------------------

## Architecture Overview

### Components

-   UI Layer (Create / Join / Playing)
-   Metronome Engine (Web Audio lookahead scheduler)
-   Sync Engine (offset estimation + drift correction)
-   WebRTC Manager (leader + peer roles)
-   SignalingTransport abstraction (Supabase adapter in V1)

------------------------------------------------------------------------

## Room Model (Leader-Owned)

``` ts
type RoomState = {
  roomId: string
  leaderId: string
  bpm: number
  version: number
  status: "open" | "countdown" | "running" | "closed"
  startAtLeaderMs?: number
  peers: Record<string, PeerConnState>
}
```

------------------------------------------------------------------------

## Message Envelope

``` ts
type Msg = {
  v: 1
  roomId: string
  from: string
  to: string | "*"
  type:
    | "join"
    | "leader_hello"
    | "offer"
    | "answer"
    | "ice"
    | "start_announce"
    | "time_ping"
    | "time_pong"
    | "param_update"
    | "room_closed"
  ts: number
  payload: any
}
```

------------------------------------------------------------------------

## Start Announcement Example

``` json
{
  "type": "start_announce",
  "to": "*",
  "payload": {
    "bpm": 120,
    "version": 1,
    "anchorLeaderMs": 1730000012000,
    "beatIndexAtAnchor": 256
  }
}
```

------------------------------------------------------------------------

## Time Sync (Ping/Pong)

Leader sends:

``` json
{
  "type": "time_ping",
  "payload": { "seq": 42, "t1LeaderMs": 1730000001234 }
}
```

Peer responds immediately:

``` json
{
  "type": "time_pong",
  "payload": {
    "seq": 42,
    "t1LeaderMs": 1730000001234,
    "t2PeerMs": 1730000001240,
    "t3PeerMs": 1730000001241
  }
}
```

Offset is estimated from best RTT sample.

------------------------------------------------------------------------

## Metronome Scheduling

-   Convert leader anchor to peer time using offset
-   Convert peer time to AudioContext time
-   Schedule clicks with 0.5s lookahead
-   Refill every 50--100ms
-   Micro-correct if phase error \> 20ms

------------------------------------------------------------------------

## State Machines (Summary)

### Leader States

-   L_IDLE
-   L_ROOM_OPEN
-   L_RUNNING
-   L_CLOSING

### Peer States

-   C_IDLE
-   C_DISCOVERING
-   C_SIGNALING
-   C_CONNECTING
-   C_SYNCING
-   C_RUNNING
-   C_RECONNECTING
-   C_FAILED

Room state is self-healing via periodic leader announcements.

------------------------------------------------------------------------

## Module Structure

-   signaling/transport.ts
-   signaling/supabase.ts
-   webrtc/leader.ts
-   webrtc/peer.ts
-   sync/clock.ts
-   audio/metronome.ts
-   state/leaderMachine.ts
-   state/peerMachine.ts
-   ui/

------------------------------------------------------------------------

## Risks & Constraints

-   iOS background audio limitations
-   TURN required on restrictive networks
-   Bluetooth earbuds introduce device-dependent latency
