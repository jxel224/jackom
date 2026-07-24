#!/usr/bin/env node
// The one-command local dev startup (`npm run dev`): starts the Next.js frontend and the server
// bootstrap (HTTP API + WebSocket gateway + timer service, all sharing one RoomActorManager — see
// apps/server/src/bootstrap.ts) side by side, with D:-local TEMP/TMP/npm_config_cache redirection
// for both, prefixed/colored output, and a clean combined shutdown. See LOCAL_DEVELOPMENT.md.
import concurrently from 'concurrently';
import { ensureDevDirs, buildDevEnv, PROJECT_ROOT } from './dev-paths.mjs';

ensureDevDirs();
const env = buildDevEnv();

const { result } = concurrently(
  [
    { command: 'npm run dev:server', name: 'server', prefixColor: 'green', cwd: PROJECT_ROOT, env },
    { command: 'npm run dev:web', name: 'web', prefixColor: 'blue', cwd: PROJECT_ROOT, env },
  ],
  {
    prefix: 'name',
    killOthersOn: ['failure', 'success'],
    restartTries: 0,
  },
);

result.then(
  () => process.exit(0),
  (results) => {
    // concurrently rejects with an array of the results of every command that exited — surface
    // exactly which one failed instead of a bare, unhelpful rejection.
    const failed = Array.isArray(results) ? results.find((r) => r && r.exitCode !== 0) : null;
    if (failed) {
      console.error(`\n✖ "${failed.command?.name ?? failed.command}" exited with code ${failed.exitCode} — the other service was stopped too.\n`);
    }
    process.exit(1);
  },
);
