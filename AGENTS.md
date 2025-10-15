This repository uses a feature‑oriented structure for the frontend. Keep game logic, UI, and utilities grouped by feature to make the codebase easier to navigate and evolve.

Guidelines

- Feature modules live under `src/features/<feature>`.
- Each feature may contain `components/`, `hooks/`, `lib/`, `types/`, and `config.ts`.
- Use path aliases with `@/` (configured in `tsconfig.json`) instead of relative `../` imports.
- Keep generic, reusable pieces under `src/shared/` (not introduced yet).
- Prefer small, focused components and hooks over large monoliths.
- Centralize constants and config (colors, sizes, timings) in `config.ts`.

Current layout

- Game: `src/features/game`
  - `components/` – UI for the game (canvas, HUD, etc.)
  - `lib/` – domain utilities (e.g., sound manager)
  - `types/` – TypeScript types for the game domain
  - `config.ts` – visual constants and settings

