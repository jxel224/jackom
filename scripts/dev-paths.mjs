// Shared by scripts/dev.mjs and scripts/check-dev-env.mjs: the project-local, D:-drive folders
// every dev script redirects TEMP/TMP/npm_config_cache into, so nothing spills onto a C: drive that
// has previously run nearly full. See LOCAL_DEVELOPMENT.md's "How D: cache redirection works."
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const PROJECT_ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export const TMP_DIR = path.join(PROJECT_ROOT, '.tmp');
export const NPM_CACHE_DIR = path.join(PROJECT_ROOT, '.npm-cache');
export const LOGS_DIR = path.join(PROJECT_ROOT, '.logs');

export function ensureDevDirs() {
  for (const dir of [TMP_DIR, NPM_CACHE_DIR, LOGS_DIR]) mkdirSync(dir, { recursive: true });
}

/** `process.env` extended with the D:-local redirection — pass this as a child process's `env`. */
export function buildDevEnv(base = process.env) {
  return {
    ...base,
    TEMP: TMP_DIR,
    TMP: TMP_DIR,
    npm_config_cache: NPM_CACHE_DIR,
  };
}
