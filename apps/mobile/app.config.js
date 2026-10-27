const appJson = require('./app.json');
const { isReleaseBuild, releaseApiUrlProblem } = require('./scripts/release-config');

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

const plugins = [...appJson.expo.plugins];
if (sentryDsn) {
  plugins.push('@sentry/react-native');
}

// The API address comes from the environment only (Plan #4). A release build without a public
// https address fails here, before anything is built.
const apiUrl = process.env.EXPO_PUBLIC_API_URL?.trim() || undefined;
if (isReleaseBuild(process.env)) {
  const problem = releaseApiUrlProblem(apiUrl);
  if (problem) {
    const profile = process.env.EAS_BUILD_PROFILE ?? 'release';
    throw new Error(`[app.config] ${profile} build: ${problem}`);
  }
}

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...appJson.expo,
    plugins,
    extra: { ...appJson.expo.extra, ...(apiUrl ? { apiUrl } : {}) },
  },
};
