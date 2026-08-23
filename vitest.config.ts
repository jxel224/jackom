import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['apps/server/test/**/*.test.ts', 'apps/web/test/**/*.test.{ts,tsx}'],
    watch: false,
    // apps/server/test/db/**/*.test.ts (Permanent Business Backend) share one real PostgreSQL
    // database and reset its tables between tests — safe only with no other test FILE mutating the
    // same tables concurrently. Vitest runs test files in parallel worker threads by default, which
    // raced these three files' truncate-between-tests against each other's in-flight inserts (a
    // real, reproduced FK-violation failure, not a hypothetical). `fileParallelism: false` runs
    // every file in one process, one at a time — noticeably slower than the previous fully-parallel
    // run, but this is a `vitest run` used for correctness verification, not a hot dev-loop.
    fileParallelism: false,
  },
});
