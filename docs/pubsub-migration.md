# Pub/Sub-Only Migration Plan (Minimal Churn, Low Lock-In)

## Goal

Replace WebRTC data/signaling paths with managed pub/sub transport so the app runs without custom backend logic and without TURN dependencies.

## Design Principles

- Keep host authoritative for room state and beat anchor.
- Keep existing `LeaderStateMachine` and `PeerStateMachine` logic mostly intact.
- Add a transport-agnostic bus interface and provider adapters.
- Use app-level protocol + heartbeats instead of provider-specific presence features.

## 1) New Core Abstraction

Create `src/realtime/bus.ts`:

```ts
export interface RealtimeBus {
  connect(roomId: string, clientId: string): Promise<void>;
  publish(msg: BusMessage): Promise<void>;
  onMessage(handler: (msg: BusMessage) => void): void;
  disconnect(): Promise<void>;
}
```

`BusMessage` stays provider-neutral:

- `type`: `peer_hello | peer_bye | room_snapshot | state_request | state_patch | sync_req | sync_res`
- `roomId`, `from`, `to`, `ts`, `payload`, `v`

## 2) Compatibility Layer (Key to minimal churn)

Add pub/sub connection managers matching current API surface:

- `HostPubSubConnectionManager`
- `PeerPubSubConnectionManager`

Expose same methods used by state machines today:

- `onPeerConnected`, `onPeerDisconnected`
- `onControl`, `onTimeSync`
- `sendControl`, `broadcastControl`
- `sendTimeSync`

Internally map to bus messages. This keeps most `state/*.ts` unchanged.

## 3) Clock Sync Over Pub/Sub

Replace ping/pong channel with request/response over bus:

- Peer sends `sync_req {seq, t1PeerMs}`.
- Host replies `sync_res {seq, t1PeerMs, t2HostMs, t3HostMs}`.
- Peer computes offset/RTT (NTP formula).

Keep continuous sync during playback (e.g. every 1s).

## 4) State Replication Model

Host emits:

- Immediate `room_snapshot` on start/stop/BPM change and on peer hello.
- Periodic `room_snapshot` heartbeat (e.g. 1s) for self-healing.

Snapshot payload includes:

- `status`, `bpm`, `version`, `anchorHostMs`, `beatIndexAtAnchor`, `emittedAtHostMs`, `connectedPeerCount`.

Peer behavior:

- Apply only newest `version`.
- If `running`, schedule from anchor using current offset.
- If not running, show waiting status.

## 5) Presence and Peer Count

Use app-level heartbeats:

- Peer sends `peer_hello` on join and heartbeat every ~5s.
- Host marks stale peers disconnected after TTL (e.g. 15s).
- Reuses existing host peer count UI with no provider lock-in.

## 6) Provider Lock-In Strategy

Implement adapters only behind `RealtimeBus`:

- `BroadcastChannelBus` (local/dev)
- `SupabaseBus` (first hosted option)
- Optional later: `AblyBus`, `FirebaseBus`

No provider types above adapter boundary.
No provider presence primitives required for correctness.

## 7) Incremental Rollout

1. Add `RealtimeBus` and bus adapters.
2. Add pub/sub connection managers with WebRTC-compatible method names.
3. Switch `LeaderStateMachine`/`PeerStateMachine` constructors to injected manager factory.
4. Enable pub/sub path via feature flag (`TRANSPORT_MODE=pubsub|webrtc`).
5. Remove WebRTC modules after bake period.

## 8) Acceptance Criteria

- Join works before/after host start.
- BPM/start/stop propagate to all peers.
- Late joiners align phase within target tolerance.
- Host can start immediately; peers show “Synchronizing clocks…” only until offset threshold.
- No TURN/STUN config required for core functionality.
