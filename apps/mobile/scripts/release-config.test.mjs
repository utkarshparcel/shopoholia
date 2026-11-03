// @vitest-environment node
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';

const require = createRequire(import.meta.url);
const {
  findLocalUrls,
  isLocalHostname,
  isReleaseBuild,
  profileApiUrlProblem,
  releaseApiUrlProblem,
  releaseSettingsProblems,
} = require('./release-config.js');
const checker = join(dirname(fileURLToPath(import.meta.url)), 'check-release-bundle.mjs');

describe('release API URL rules (Plan #4)', () => {
  it('accepts only a public https address', () => {
    expect(releaseApiUrlProblem('https://api.example.com')).toBeNull();
    expect(releaseApiUrlProblem(undefined)).toMatch(/not set/);
    expect(releaseApiUrlProblem('api.example.com')).toMatch(/not a URL/);
    expect(releaseApiUrlProblem('http://api.example.com')).toMatch(/https/);
    expect(releaseApiUrlProblem('https://localhost:3000')).toMatch(/local host/);
    expect(releaseApiUrlProblem('https://10.0.2.2:3000')).toMatch(/local host/);
  });

  it('knows the local hosts', () => {
    for (const host of ['localhost', '127.0.0.1', '10.0.2.2', '192.168.1.4', '172.20.0.3', '[::1]', 'api.local', 'worn.test']) {
      expect(isLocalHostname(host)).toBe(true);
    }
    for (const host of [
      '169.254.10.1',
      '100.64.0.7',
      '100.127.255.1',
      'fe80::1',
      'fd12:3456::1',
      'abc123.ngrok-free.app',
      'x.ngrok.io',
      'quiet-cat.trycloudflare.com',
      'mine.loca.lt',
      'router.lan',
    ]) {
      expect(isLocalHostname(host)).toBe(true);
    }
    for (const host of ['api.example.com', '172.32.0.1', '11.0.0.1', '100.128.0.1', 'api.worncloset.app']) {
      expect(isLocalHostname(host)).toBe(false);
    }
  });

  it('pins the production profile to the production API', () => {
    expect(profileApiUrlProblem('https://api.worncloset.app', 'production')).toBeNull();
    expect(profileApiUrlProblem('https://api.worncloset.app/', 'production')).toBeNull();
    expect(profileApiUrlProblem('https://staging-api.worncloset.app', 'production')).toMatch(
      /must use https:\/\/api\.worncloset\.app/,
    );
    expect(profileApiUrlProblem('https://staging-api.worncloset.app', 'preview')).toBeNull();
    expect(profileApiUrlProblem('http://localhost:3000', 'preview')).toMatch(/https/);
  });

  it("fails a release build without the Google client id of the platform it builds", () => {
    const ios = 'ios-1.apps.googleusercontent.com';
    const android = 'android-1.apps.googleusercontent.com';
    expect(releaseSettingsProblems({ EAS_BUILD_PLATFORM: 'ios' }).errors).toEqual([
      expect.stringMatching(/EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID is not set/),
    ]);
    expect(
      releaseSettingsProblems({ EAS_BUILD_PLATFORM: 'ios', EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: ios }).errors,
    ).toEqual([]);
    expect(
      releaseSettingsProblems({ EAS_BUILD_PLATFORM: 'android', EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: ios }).errors,
    ).toEqual([expect.stringMatching(/EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID is not set/)]);
    expect(
      releaseSettingsProblems({ EAS_BUILD_PLATFORM: 'android', EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: 'oops' })
        .errors,
    ).toEqual([expect.stringMatching(/not a Google OAuth client id/)]);
    // A local run (no platform) only warns, for both.
    const local = releaseSettingsProblems({});
    expect(local.errors).toEqual([]);
    expect(local.warnings.join('\n')).toMatch(/IOS_CLIENT_ID[\s\S]*ANDROID_CLIENT_ID/);
    expect(
      releaseSettingsProblems({ EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: ios, EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: android })
        .warnings.join('\n'),
    ).not.toMatch(/CLIENT_ID/);
  });

  it('warns when the build would send no crash reports or analytics', () => {
    expect(releaseSettingsProblems({}).warnings.join('\n')).toMatch(/SENTRY_DSN[\s\S]*POSTHOG_KEY/);
    expect(
      releaseSettingsProblems({ EXPO_PUBLIC_SENTRY_DSN: 'https://k@o.ingest.sentry.io/1', EXPO_PUBLIC_POSTHOG_KEY: 'phc_x' })
        .warnings.join('\n'),
    ).not.toMatch(/SENTRY|POSTHOG/);
  });

  it('treats every EAS profile but development as a release, unless the profile says', () => {
    expect(isReleaseBuild({ EAS_BUILD_PROFILE: 'production' })).toBe(true);
    expect(isReleaseBuild({ EAS_BUILD_PROFILE: 'play-internal' })).toBe(true);
    expect(isReleaseBuild({ EAS_BUILD_PROFILE: 'development' })).toBe(false);
    expect(isReleaseBuild({})).toBe(false);
    expect(isReleaseBuild({ WORN_RELEASE_BUILD: '1' })).toBe(true);
    expect(isReleaseBuild({ EAS_BUILD_PROFILE: 'development', WORN_RELEASE_BUILD: '1' })).toBe(true);
  });

  it('finds local URLs, not the word localhost', () => {
    expect(findLocalUrls('fetch("http://localhost:3000/me")')).toEqual(['http://localhost:3000/me']);
    expect(findLocalUrls('ws://127.0.0.1:8081 and http://10.0.2.2')).toHaveLength(2);
    expect(findLocalUrls('Righttp://localhost:8081')).toEqual(['http://localhost:8081']);
    expect(findLocalUrls('if (host === "localhost") return;')).toEqual([]);
  });
});

/** Base64 VLQ, enough to write a test source map. */
function vlq(value) {
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  let v = value < 0 ? (-value << 1) | 1 : value << 1;
  let out = '';
  do {
    let digit = v & 31;
    v >>>= 5;
    if (v > 0) digit |= 32;
    out += B64[digit];
  } while (v > 0);
  return out;
}

/** A one-line bundle of `parts` ([source, code]) and its source map. */
function mappedBundle(parts) {
  const sources = [...new Set(parts.map(([source]) => source))];
  let code = '';
  let lastColumn = 0;
  let lastSource = 0;
  const segments = [];
  for (const [source, text] of parts) {
    const index = sources.indexOf(source);
    segments.push(`${vlq(code.length - lastColumn)}${vlq(index - lastSource)}AA`);
    lastColumn = code.length;
    lastSource = index;
    code += text;
  }
  return { code, map: JSON.stringify({ version: 3, sources, names: [], mappings: segments.join(',') }) };
}

describe('check-release-bundle.mjs', () => {
  let dir;

  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  function bundle(files) {
    dir = mkdtempSync(join(tmpdir(), 'worn-release-'));
    for (const [name, text] of Object.entries(files)) {
      mkdirSync(join(dir, name, '..'), { recursive: true });
      writeFileSync(join(dir, name), text);
    }
    return dir;
  }

  function run(target) {
    try {
      return { code: 0, out: execFileSync('node', [checker, target], { encoding: 'utf8', stdio: 'pipe' }) };
    } catch (error) {
      return { code: error.status, out: `${error.stdout}${error.stderr}` };
    }
  }

  it('passes a bundle that only calls a public host', () => {
    const result = run(bundle({ '_expo/static/js/index.js': 'fetch("https://api.example.com/me")' }));
    expect(result.code).toBe(0);
  });

  it('fails a bundle that calls localhost, and names the file', () => {
    const result = run(
      bundle({
        '_expo/static/js/ios/index.js': 'fetch("http://localhost:3000/me")',
        'other.js.map': '{"sourcesContent":["// http://localhost:3000"]}',
      }),
    );
    expect(result.code).toBe(1);
    expect(result.out).toContain('index.js: http://localhost:3000/me');
    expect(result.out).not.toContain('.map');
  });

  it('allows a library default only from its own module', () => {
    const lib = '/x/node_modules/.pnpm/rn/node_modules/react-native/Libraries/Core/Devtools/getDevServer.js';
    const ok = mappedBundle([
      [lib, 'var o="http://localhost:8081/";'],
      ['/app/src/api/client.ts', 'fetch("https://api.example.com/me");'],
    ]);
    const passed = run(bundle({ 'index.js': `${ok.code}\n//# sourceMappingURL=http://localhost:8081/index.js.map`, 'index.js.map': ok.map }));
    expect(passed.code).toBe(0);
    expect(passed.out).toContain('allowed library default: index.js: http://localhost:8081/');

    const bad = mappedBundle([
      [lib, 'var o="https://example.com";'],
      ['/app/src/api/client.ts', 'var u="http://localhost:8081/";'],
    ]);
    const failed = run(bundle({ 'index.js': bad.code, 'index.js.map': bad.map }));
    expect(failed.code).toBe(1);
    expect(failed.out).toContain('index.js: http://localhost:8081/ (/app/src/api/client.ts)');
  });

  it('asks for a plain-JS export instead of Hermes bytecode', () => {
    const result = run(bundle({ '_expo/static/js/ios/index.hbc': 'x\u0000http://localhost:3000\u0000y' }));
    expect(result.code).toBe(2);
    expect(result.out).toContain('--no-bytecode');
  });
});
