# @jackom/web

The Next.js (App Router) frontend for جاكوم — Arabic RTL, TV/host + player-phone experiences.

This app has its own `package.json`/`node_modules` (standard Next.js project layout), but imports
shared game types directly from `../../packages/shared-types/src` via `lib/shared.ts`, the same
relative-import convention `apps/server` uses — see that package's README for why.

## Commands

Run from this directory, or via the root's convenience scripts (`npm run dev:web`, `build:web`,
`lint:web` from the repo root):

```bash
npm run dev         # local dev server
npm run build        # production build
npm run start         # serve a production build
npm run lint           # eslint
npm run typecheck   # tsc --noEmit (also included in the root `npm run typecheck` chain)
```

Tests for this app live in `test/` and run through the repo's single root Vitest config
(`npm test` from the repo root covers both `apps/server` and `apps/web`).
