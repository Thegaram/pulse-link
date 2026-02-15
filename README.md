# Pulse Link

A minimal shared metronome for in-room sessions.

Pulse Link runs as a static web app, with host and join flows in a simple two-tab UI. Sync and control messages are distributed through managed pub/sub signaling (Ably, Supabase, or local mock).

## Stack

- Svelte 5 + Vite UI shell (`src/svelte`)
- TypeScript runtime for transport, sync, audio, and state machines (`src/state`, `src/realtime`, `src/sync`, `src/audio`)
- Config-driven signaling backend selection (`config.js` + optional `config.local.json`)

## Development

```bash
npm install
npm run dev
# open http://localhost:8000
```

### Build and checks

```bash
npm run check   # TypeScript typecheck
npm run build   # Production build to dist/
npm run preview # Serve dist/ locally on :8000
```

## Runtime Configuration

- `TRANSPORT_MODE`: currently `pubsub` (default)
- `SIGNALING_BACKEND`: `mock`, `ably`, or `supabase`
- Optional local overrides are loaded from `config.local.json` when present.

### Local secrets

- Put local credentials in `.env` (ignored by git).
- `npm run dev` and `npm run build` auto-generate `config.local.json` via `scripts/generate-local-config.mjs`.
- Template: `.env.example`.

## Svelte Architecture

`src/svelte/App.svelte` is the composition root.

- `src/svelte/components/*`: presentational UI components
- `src/svelte/state/*`: stores + controllers
  - stores: `host.ts`, `join.ts`, `ui.ts`, `session.ts`
  - orchestration: `controller.ts`, `host-controller.ts`, `join-controller.ts`, `view-controller.ts`, `timer-lifecycle.ts`, `controller-types.ts`
- `src/svelte/services/*`: browser side effects (clipboard, QR, URL/localStorage helpers, beat visual effects)

## Deployment

Build and deploy `dist/` to any static host.

No app-specific backend service is required.
