/**
 * Release-build rules for the API address (Plan #4, §5.8), shared by app.config.js and
 * check-release-bundle.mjs: a build that ships to testers or a store never calls a local host.
 */
/* global URL, module */

/** Hosts that only exist on a developer's machine, an emulator or a home network. */
function isLocalHostname(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return (
    host === 'localhost' ||
    host === '0.0.0.0' ||
    host === '::1' ||
    /\.(localhost|local|test|internal)$/.test(host) ||
    /^127\./.test(host) ||
    /^10\./.test(host) || // includes the Android emulator's 10.0.2.2
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
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

module.exports = { findLocalUrls, isLocalHostname, isReleaseBuild, releaseApiUrlProblem };
