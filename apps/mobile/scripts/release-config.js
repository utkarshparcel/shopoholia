/**
 * Release-build rules for the API address (Plan #4, §5.8), shared by app.config.js and
 * check-release-bundle.mjs: a build that ships to testers or a store never calls a local host.
 */
/* global URL, module */

/** The API every production (store) build talks to. */
const PRODUCTION_API_URL = 'https://api.worncloset.app';

/**
 * Hosts that only exist on a developer's machine, an emulator, a home or carrier network, or a
 * tunnel to a laptop.
 */
function isLocalHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    host === '::' ||
    /\.(localhost|local|test|internal|lan|home\.arpa)$/.test(host) ||
    /^127\./.test(host) ||
    /^10\./.test(host) || // includes the Android emulator's 10.0.2.2
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) || // link-local
    /^100\.(6[4-9]|[7-9]\d|1[01]\d|12[0-7])\./.test(host) || // carrier-grade NAT, Tailscale
    /^fe[89ab][0-9a-f]:/.test(host) || // IPv6 link-local
    /^f[cd][0-9a-f]{2}:/.test(host) || // IPv6 unique local
    // Tunnels to a developer's machine.
    /(^|\.)(ngrok(-free)?\.(app|dev|io)|ngrok\.io|loca\.lt|trycloudflare\.com|localtunnel\.me)$/.test(host)
  );
}

/** Why `url` can't be a release build's API address, or null when it can be. */
function releaseApiUrlProblem(url) {
  if (!url) {
    return 'EXPO_PUBLIC_API_URL is not set. Set it in the EAS environment for this profile.';
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return `EXPO_PUBLIC_API_URL is not a URL (${url}).`;
  }
  if (parsed.protocol !== 'https:') return `EXPO_PUBLIC_API_URL must use https (${url}).`;
  if (isLocalHostname(parsed.hostname)) {
    return `EXPO_PUBLIC_API_URL points at a local host (${parsed.hostname}).`;
  }
  return null;
}

/**
 * Why `url` can't be this profile's API address, or null. On top of releaseApiUrlProblem, the
 * production (store) profile must use the production API itself, not a staging or test host.
 */
function profileApiUrlProblem(url, profile) {
  const problem = releaseApiUrlProblem(url);
  if (problem) return problem;
  if (profile === 'production' && url.replace(/\/+$/, '') !== PRODUCTION_API_URL) {
    return `the production profile must use ${PRODUCTION_API_URL} (EXPO_PUBLIC_API_URL is ${url}).`;
  }
  return null;
}

const GOOGLE_CLIENT_ENV = {
  ios: 'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  android: 'EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID',
};

/**
 * Release-build settings, by severity. Errors stop the build: a missing Google client id for the
 * platform being built ships a login screen with no way in (EAS sets EAS_BUILD_PLATFORM; a local
 * `expo config`/`expo export` without it gets warnings for both platforms instead). Warnings name
 * what the build will lack (crash reports, analytics).
 */
function releaseSettingsProblems(env) {
  const errors = [];
  const warnings = [];
  const platform = env.EAS_BUILD_PLATFORM;
  const platforms = platform === 'ios' || platform === 'android' ? [platform] : ['ios', 'android'];
  for (const p of platforms) {
    const name = GOOGLE_CLIENT_ENV[p];
    const value = env[name]?.trim();
    let problem = null;
    if (!value) problem = `${name} is not set: Google sign-in can't work in the ${p} app.`;
    else if (!/^[\w-]+\.apps\.googleusercontent\.com$/.test(value)) {
      problem = `${name} is not a Google OAuth client id (${value}).`;
    }
    if (problem) (platform ? errors : warnings).push(problem);
  }
  if (!env.EXPO_PUBLIC_SENTRY_DSN?.trim() && !env.SENTRY_DSN?.trim()) {
    warnings.push('EXPO_PUBLIC_SENTRY_DSN is not set: this build sends no crash reports.');
  }
  if (!env.EXPO_PUBLIC_POSTHOG_KEY?.trim()) {
    warnings.push('EXPO_PUBLIC_POSTHOG_KEY is not set: this build sends no product analytics.');
  }
  return { errors, warnings };
}

/**
 * True for builds that ship to testers or a store: every EAS profile but `development`, and any
 * build run with WORN_RELEASE_BUILD=1 (each eas.json profile sets it).
 */
function isReleaseBuild(env) {
  if (env.WORN_RELEASE_BUILD === '1') return true;
  if (env.WORN_RELEASE_BUILD === '0') return false;
  const profile = env.EAS_BUILD_PROFILE;
  return Boolean(profile) && profile !== 'development';
}

/** A URL to a local host, as it would appear in a bundle's code or data (even glued to a word). */
const LOCAL_URL_PATTERN =
  /(?:https?|wss?):\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|10\.0\.2\.2|\[::1\])(?::\d+)?[^\s"'`)]*/gi;

function findLocalUrls(text) {
  return text.match(LOCAL_URL_PATTERN) ?? [];
}

module.exports = {
  PRODUCTION_API_URL,
  findLocalUrls,
  isLocalHostname,
  isReleaseBuild,
  profileApiUrlProblem,
  releaseApiUrlProblem,
  releaseSettingsProblems,
};
