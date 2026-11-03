// @vitest-environment node
import { createRequire } from 'node:module';
import { afterEach, describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const configPath = require.resolve('../app.config.js');

const IOS_ID = 'ios-1.apps.googleusercontent.com';
const ANDROID_ID = 'android-1.apps.googleusercontent.com';
const RELEASE = {
  WORN_RELEASE_BUILD: '1',
  EAS_BUILD_PROFILE: 'production',
  EXPO_PUBLIC_API_URL: 'https://api.worncloset.app',
  EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID: IOS_ID,
  EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: ANDROID_ID,
  EXPO_PUBLIC_SENTRY_DSN: '',
  SENTRY_DSN: '',
  EXPO_PUBLIC_FEATURE_CLOSET: '',
  EAS_BUILD_PLATFORM: '',
};

/** app.config.js reads the environment when it loads: load it fresh with `env`. */
function loadConfig(env) {
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  delete require.cache[configPath];
  return require(configPath).expo;
}

function pluginOptions(config, name) {
  const plugin = config.plugins.find((p) => (Array.isArray(p) ? p[0] : p) === name);
  return Array.isArray(plugin) ? plugin[1] : plugin;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete require.cache[configPath];
});

describe('app.config.js for Worn Play release builds', () => {
  it('declares only what Worn Play uses, worded for Worn Play', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const config = loadConfig(RELEASE);
    const blocked = config.android.blockedPermissions;
    for (const permission of ['READ_CALENDAR', 'WRITE_CALENDAR', 'CAMERA', 'SYSTEM_ALERT_WINDOW', 'READ_SMS']) {
      expect(blocked).toContain(`android.permission.${permission}`);
    }
    expect(config.android.permissions).not.toContain('android.permission.READ_CALENDAR');
    const picker = pluginOptions(config, 'expo-image-picker');
    expect(picker.photosPermission).toBe('WORN uses the photo you choose to make your try-on avatar.');
    expect(picker.photosPermission + picker.cameraPermission).not.toMatch(/receipt|care label|gift card/);
    expect(pluginOptions(config, 'expo-calendar').calendarPermission).not.toMatch(/plan outfits/);
  });

  it('keeps the Closet permissions when Closet is on', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const config = loadConfig({ ...RELEASE, EXPO_PUBLIC_FEATURE_CLOSET: '1' });
    expect(config.android.permissions).toContain('android.permission.READ_CALENDAR');
    expect(config.android.blockedPermissions).not.toContain('android.permission.READ_CALENDAR');
    expect(pluginOptions(config, 'expo-image-picker').cameraPermission).toMatch(/receipts/);
  });

  it('offers Sign in with Apple and declares no non-exempt encryption on iOS', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const config = loadConfig(RELEASE);
    expect(config.ios.usesAppleSignIn).toBe(true);
    expect(config.plugins).toContain('expo-apple-authentication');
    expect(config.ios.config.usesNonExemptEncryption).toBe(false);
    expect(config.ios.privacyManifests.NSPrivacyTracking).toBe(false);
    // The Google redirect (`<package>:/oauthredirect`) has to open the app on Android too.
    expect(config.scheme).toEqual(['worn', config.android.package]);
  });

  it('refuses an EAS build without the Google client id for its platform', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() =>
      loadConfig({ ...RELEASE, EAS_BUILD_PLATFORM: 'android', EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID: '' }),
    ).toThrow(/EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID is not set/);
    expect(() => loadConfig({ ...RELEASE, EAS_BUILD_PLATFORM: 'ios' })).not.toThrow();
  });

  it('refuses a production build that points anywhere but the production API', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(() => loadConfig({ ...RELEASE, EXPO_PUBLIC_API_URL: 'https://staging.worncloset.app' })).toThrow(
      /production profile must use https:\/\/api\.worncloset\.app/,
    );
  });

  it('warns about a release without crash reporting', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    loadConfig(RELEASE);
    expect(warn.mock.calls.map((c) => c[0]).join('\n')).toMatch(/EXPO_PUBLIC_SENTRY_DSN is not set/);
  });
});

describe('eas.json store profiles', () => {
  const eas = require('../eas.json');
  const resolved = (name) => {
    const profile = eas.build[name];
    return profile.extends ? { ...resolved(profile.extends), ...profile } : profile;
  };

  it('bumps the build number on every store upload (appVersionSource remote)', () => {
    expect(eas.cli.appVersionSource).toBe('remote');
    const store = Object.keys(eas.build).filter((name) => resolved(name).distribution === 'store');
    expect(store.sort()).toEqual(['play-internal', 'production', 'testflight']);
    for (const name of store) expect(resolved(name).autoIncrement).toBe(true);
  });
});
