#!/usr/bin/env node
/**
 * Fails when a release bundle contains a URL to a local host (Plan #4, §5.8 P0 test).
 *
 *   EXPO_PUBLIC_API_URL=https://… WORN_RELEASE_BUILD=1 \
 *     npx expo export --platform ios --no-bytecode --source-maps --output-dir dist-release
 *   node scripts/check-release-bundle.mjs dist-release
 *
 * Scans the exported JS, HTML and JSON. Each local URL in a .js file is traced through the .js.map
 * next to it to the module it came from: a few libraries ship a local-host default that a release
 * build never uses (ALLOWED below), and those are listed but don't fail. Anything else fails,
 * including any hit in app code or in a file with no source map.
 *
 * Export with --no-bytecode: Hermes bytecode keeps one copy of each string and packs them
 * together, so a hit there can't be traced to its module (and our code and expo-router both
 * spell `http://localhost:3000`). The JS is the same code Hermes compiles.
 */
/* global console, process */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
import { extname, join, relative } from 'node:path';

const require = createRequire(import.meta.url);
const { findLocalUrls } = require('./release-config.js');

/** Library defaults that are inert in a release build: the URL, and the module it must come from. */
const ALLOWED = [
  {
    // React Native's dev-server address, read only when a dev server is attached.
    url: 'http://localhost:8081/',
    source: /\/node_modules\/react-native\/Libraries\/Core\/Devtools\/getDevServer\.js$/,
  },
  {
    // Sentry Spotlight's local sidecar, used only when the Spotlight integration is added
    // (src/lib/sentry.ts never adds it).
    url: 'http://localhost:8969/stream',
    source: /\/node_modules\/@sentry\/(?:browser|react-native)\/(?:.*\/)?integrations\/spotlight\.js$/,
  },
  {
    // expo-router's placeholder origin for <Head> URLs when no `origin` is configured (web only).
    url: 'http://localhost:3000',
    source: /\/node_modules\/expo-router\/build\/head\/url\.js$/,
  },
];

const SCANNED = new Set(['.js', '.bundle', '.html', '.json']);
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function* files(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else yield path;
  }
}

/** Per generated line, the [column, source index] segments of a v3 source map. */
function decodeMappings(mappings) {
  const lines = [];
  let source = 0;
  for (const line of mappings.split(';')) {
    const segments = [];
    let column = 0;
    for (const segment of line.split(',')) {
      if (!segment) continue;
      const fields = [];
      let value = 0;
      let shift = 0;
      for (const ch of segment) {
        const digit = B64.indexOf(ch);
        value += (digit & 31) << shift;
        if (digit & 32) {
          shift += 5;
        } else {
          fields.push(value & 1 ? -(value >>> 1) : value >>> 1);
          value = 0;
          shift = 0;
        }
      }
      column += fields[0];
      if (fields.length > 1) source += fields[1];
      segments.push([column, fields.length > 1 ? source : -1]);
    }
    lines.push(segments);
  }
  return lines;
}

function sourceLookup(mapPath) {
  if (!existsSync(mapPath)) return null;
  const map = JSON.parse(readFileSync(mapPath, 'utf8'));
  const lines = decodeMappings(map.mappings);
  return (line, column) => {
    let found = -1;
    for (const [segmentColumn, source] of lines[line] ?? []) {
      if (segmentColumn > column) break;
      found = source;
    }
    return found >= 0 ? map.sources[found] : null;
  };
}

function isAllowed(url, source) {
  return Boolean(source) && ALLOWED.some((entry) => entry.url === url && entry.source.test(source));
}

const dir = process.argv[2];
if (!dir) {
  console.error('usage: check-release-bundle.mjs <expo export output dir>');
  process.exit(2);
}

let scanned = 0;
const hits = [];
const allowed = [];
const bytecode = [];
for (const path of files(dir)) {
  const ext = extname(path);
  if (ext === '.hbc') bytecode.push(relative(dir, path));
  if (!SCANNED.has(ext)) continue;
  scanned += 1;
  const lookup = ext === '.js' ? sourceLookup(`${path}.map`) : null;
  readFileSync(path, 'utf8')
    .split('\n')
    .forEach((text, line) => {
      // The export's own pointer to the map, not code.
      if (text.startsWith('//# sourceMappingURL=')) return;
      let from = 0;
      for (const url of findLocalUrls(text)) {
        const column = text.indexOf(url, from);
        from = column + url.length;
        const source = lookup?.(line, column) ?? null;
        const where = `${relative(dir, path)}: ${url}${source ? ` (${source.replace(/^.*\/node_modules\//, '')})` : ''}`;
        (isAllowed(url, source) ? allowed : hits).push(where);
      }
    });
}

if (bytecode.length > 0) {
  console.error(
    `check-release-bundle: ${bytecode[0]} is Hermes bytecode, which can't be traced to its modules. ` +
      'Export with --no-bytecode --source-maps and check that.',
  );
  process.exit(2);
}
if (scanned === 0) {
  console.error(`check-release-bundle: no bundle files under ${dir}`);
  process.exit(2);
}
for (const hit of allowed) console.log(`  allowed library default: ${hit}`);
if (hits.length > 0) {
  console.error(`check-release-bundle: ${hits.length} local URL(s) in the release bundle:`);
  for (const hit of hits) console.error(`  ${hit}`);
  process.exit(1);
}
console.log(`check-release-bundle: ok (${scanned} files, no local URLs outside ${allowed.length} allowed library defaults)`);
