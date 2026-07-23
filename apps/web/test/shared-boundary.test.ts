import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * ARCHITECTURE.md §8.6: `RoomState`/`RoomPrivateState` are server-internal persistence documents
 * (`apps/server/src/types/room-state.ts`) that must never reach a client — only the explicit view
 * projections (`TvView`/`PlayerView`/`PrivatePlayerPayload`) are safe to serialize/consume.
 *
 * Both types are pure TypeScript interfaces with no runtime representation, so a runtime
 * `Object.keys()` check on an import can never detect their presence or absence — TypeScript
 * erases type-only exports at compile time regardless of whether the source actually exported
 * them. A static source scan of every `import` statement is the only check that can actually catch
 * a frontend file that starts importing these types (or the server-only module that declares
 * them), so that's what this test does.
 */

const here = dirname(fileURLToPath(import.meta.url));
const SCAN_ROOTS = ['app', 'components', 'lib'].map((dir) => join(here, '..', dir));

function collectSourceFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      files.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      files.push(full);
    }
  }
  return files;
}

const IMPORT_LINE = /^\s*import\s.+$/gm;
const FORBIDDEN_IDENTIFIER = /\b(RoomState|RoomPrivateState)\b/;
const FORBIDDEN_MODULE_PATH = /types\/room-state(\.js)?['"]/;

const sourceFiles = SCAN_ROOTS.flatMap(collectSourceFiles);

describe('No frontend source file imports raw backend RoomState/RoomPrivateState', () => {
  it('found the expected app/component/lib source files to scan', () => {
    expect(sourceFiles.length).toBeGreaterThan(10);
  });

  it.each(sourceFiles)('%s has no import of RoomState/RoomPrivateState or the server-only room-state module', (file) => {
    const content = readFileSync(file, 'utf8');
    for (const line of content.match(IMPORT_LINE) ?? []) {
      expect(line).not.toMatch(FORBIDDEN_IDENTIFIER);
      expect(line).not.toMatch(FORBIDDEN_MODULE_PATH);
    }
  });
});
