# Pulse Link

[![CI](https://github.com/Thegaram/pulse-link/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/Thegaram/pulse-link/actions/workflows/ci.yml)

Pulse Link is a minimal, static-hosted shared metronome for in-room sessions.  
One user hosts a room, others join with a 6-character code, and all clients stay tempo/phase aligned.

## High-Level Architecture

- UI: Svelte 5 + Vite (`src/svelte`)
- Core runtime: TypeScript state/sync/audio modules (`src/state`, `src/sync`, `src/audio`)
- Transport: managed pub/sub signaling backends (`Ably`, `Supabase`, `mock`) via `src/signaling` and `src/realtime`
- Deployment model: static site only (no app-specific backend required)

Default mode is pub/sub state sync (`TRANSPORT_MODE='pubsub'`). Legacy WebRTC modules still exist but are not the primary path.

## Development

```bash
npm install
npm run dev
# open http://localhost:8000
```

```bash
npm run check   # TypeScript typecheck
npm run lint    # ESLint (TS + Svelte)
npm run format:check # Prettier check
npm run lint:secrets # Secret scanning
npm run build   # production build to dist/
npm run preview # serve dist/ on :8000
```

## Runtime Config

- Base config lives in `config.js`.
- Optional local overrides are loaded from `config.local.json`.
- `.env` is used locally and transformed into `config.local.json` by `scripts/generate-local-config.mjs` on `dev`/`build`.

Use `.env.example` as the template, and keep secrets out of git.

## Deploy

Publish `dist/` to any static host (for example, GitHub Pages).  
For production testing, provide signaling credentials via environment-driven `config.local.json` generation.
