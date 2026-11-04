import fs from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * S3-27 — developer-only notes (table names, internal product lines, env vars, raw formats)
 * must not reach users. This scans the Closet components and screens, comments stripped.
 */
const DEV_COPY = [
  /money_ledger/,
  /Play blend/i,
  /separate from Play/i,
  /Reduce Motion —/,
  /EXPO_PUBLIC_/,
  /UTC HH:mm/,
  /feature flag off/i,
];

const roots = [path.resolve(__dirname), path.resolve(__dirname, '../../app/(closet)')];

function sourceFiles(dir: string): string[] {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.tsx') && !f.includes('.test.'))
    .map((f) => path.join(dir, f));
}

function withoutComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1');
}

describe('Closet UI copy (S3-27)', () => {
  it('shows no developer-only notes', () => {
    const hits: string[] = [];
    for (const file of roots.flatMap(sourceFiles)) {
      const src = withoutComments(fs.readFileSync(file, 'utf8'));
      for (const pattern of DEV_COPY) {
        if (pattern.test(src)) hits.push(`${path.basename(file)}: ${pattern}`);
      }
    }
    expect(hits).toEqual([]);
  });
});
