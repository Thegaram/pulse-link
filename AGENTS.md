# Repository Guidelines

## Project Structure & Module Organization
`src/` contains all TypeScript source code, organized by concern:
- `src/audio/` metronome and click generation
- `src/sync/` clock sync and drift logic
- `src/webrtc/` peer/leader channel handling
- `src/signaling/` signaling transports (Supabase + mock)
- `src/state/` leader/peer state machines
- `src/ui/` app controller and UI helpers

Static entry points live at the repo root: `index.html`, `styles.css`, and manual test pages (`test-metronome.html`, `test-webrtc.html`, `test-sync.html`). Compiled output goes to `dist/`.

## Build, Test, and Development Commands
- `npm run build` compiles TypeScript using `tsconfig.json` into `dist/`.
- `npm run watch` runs TypeScript in watch mode for active development.
- `npm run serve` starts a local static server at `http://localhost:8000`.

Typical loop:
```bash
npm run watch
npm run serve
```
Then open `index.html` or a `test-*.html` page in the browser.

## Coding Style & Naming Conventions
Use TypeScript with strict compiler settings (`strict`, `noUnusedLocals`, `noImplicitReturns`).
- Indentation: 2 spaces.
- Classes/types: `PascalCase` (for example, `LeaderSyncEngine`).
- Variables/functions/methods: `camelCase`.
- File names: kebab-case by module purpose (for example, `leader-machine.ts`, `sync-engine.ts`).
- Keep modules focused; prefer small, single-responsibility classes.

## Testing Guidelines
There is currently no automated test runner; testing is manual via browser pages:
- `test-metronome.html` for audio behavior
- `test-webrtc.html` for peer connectivity
- `test-sync.html` for offset/RTT stability

Follow `TESTING.md` for setup details (including Chrome mDNS flag changes for same-machine tab tests). Validate on at least two tabs before submitting significant sync or signaling changes.

## Commit & Pull Request Guidelines
Match the existing commit style: concise, imperative summaries (for example, `Fix WebRTC connection issues and add comprehensive debugging`).
- Keep commits scoped to one logical change.
- In PRs, include: purpose, key changes, manual test steps run, and any observed sync metrics.
- Link related issues and include screenshots when UI behavior changes.

## Configuration & Security Tips
Runtime configuration is in `config.js`. Do not commit secrets or environment-specific credentials. Treat signaling credentials and room identifiers as sensitive when sharing logs.
