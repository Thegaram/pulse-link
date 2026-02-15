# Repository Guidelines

## Project Structure & Module Organization

`src/` is organized by layer:

- `src/svelte/`: App shell, components, stores, controllers, browser services
- `src/state/`: transport-agnostic leader/peer state machines
- `src/realtime/`: connection managers for pub/sub and legacy WebRTC paths
- `src/signaling/`: signaling transport adapters (`ably`, `supabase`, `mock`)
- `src/sync/`: clock offset estimation/filtering
- `src/audio/`: metronome scheduler + click synthesis
- `src/webrtc/`: legacy RTC connection/channel logic (not default runtime path)

Composition root is `src/svelte/App.svelte`. Build output is `dist/`.

## Build, Test, and Development Commands

- `npm run dev`: starts Vite dev server on `http://localhost:8000`
- `npm run check`: strict TypeScript checks (`noEmit`)
- `npm run lint`: ESLint across TS/Svelte
- `npm run format` / `npm run format:check`: Prettier write/check
- `npm run lint:secrets`: Secretlint scan
- `npm run build`: production build to `dist/`
- `npm run preview`: serve built output on `:8000`

`predev` and `prebuild` run `scripts/generate-local-config.mjs` to create `config.local.json` from `.env` values.

## Coding Style & Naming Conventions

TypeScript is strict. Keep modules focused and explicit.

- Indentation: 2 spaces
- Naming: `PascalCase` for types/classes, `camelCase` for values/functions, kebab-case file names
- Avoid stringly typed behavior decisions in UI; prefer explicit enums/flags in stores/controllers
- Prefer transport/state logic in `src/state` + `src/realtime`, not Svelte component files

## Testing Guidelines

Automated tests are not set up yet; validation is manual.

- Minimum checks: host/join flow, start/stop propagation, BPM changes while running, late join behavior
- Validate with at least two clients (desktop + mobile preferred)
- Verify refresh/resume behavior for host and follower
- Run `npm run check` before committing

## Commit & Pull Request Guidelines

Use imperative commit subjects and keep one logical change per commit.

- Include intent, behavioral impact, and manual verification notes
- For UI changes, include screenshots/video
- For sync logic changes, include reproduction scenario and observed result

## Architecture Decisions & Constraints

- Static-hosted first: no app-specific backend service is required.
- Default runtime is pub/sub (`TRANSPORT_MODE='pubsub'`); signaling backend selectable (`ably`, `supabase`, `mock`).
- Host is source of truth for tempo/run state; followers apply host updates and clock-offset corrections.
- Followers may continue playback through transient host refresh; host can re-associate to prior room/session.
- Session continuity relies on browser persistence (`localStorage`) for room code, BPM, and host anchor snapshot.
- Keep control UX minimal: two tabs (`Host`/`Join`), simple BPM controls, large start/stop actions.

## Security & Configuration Notes

- Never commit `.env` or generated `config.local.json`.
- Prefer short-lived scoped tokens for signaling providers; do not expose privileged API keys in browser builds.
- Current protocol is trust-based by room code; treat room IDs and logs as sensitive.
- URL `?room=` is share-friendly but can leak via screenshots/history.
