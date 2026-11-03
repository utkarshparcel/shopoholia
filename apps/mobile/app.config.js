const appJson = require('./app.json');
const {
  isReleaseBuild,
  profileApiUrlProblem,
  releaseSettingsProblems,
} = require('./scripts/release-config');

const env = process.env;
const sentryDsn = env.EXPO_PUBLIC_SENTRY_DSN || env.SENTRY_DSN;
const closetOn = env.EXPO_PUBLIC_FEATURE_CLOSET === '1';

/**
 * Permission prompts and declarations follow what the build can do. Worn Play (Closet off, every
 * release profile today) picks one photo from the library for the try-on avatar and asks for
 * nothing else; Closet also uses the camera (clothes, receipts) and reads calendar event titles.
 * The camera and calendar strings stay on iOS because the linked modules reference those APIs
 * (App Store Connect refuses a binary without them), worded for what the build does.
 */
const PERMISSION_COPY = closetOn
  ? {
      photos:
        'WORN uses the photos you pick to add clothes, read care labels, receipts and gift cards, log what you wore, and make your try-on avatar.',
      camera:
        'WORN uses the camera to photograph your clothes, care labels, receipts and gift cards, log what you wore, and make your try-on avatar.',
      calendar:
        'WORN reads event titles (interview, wedding, office) to plan outfits. You can skip this anytime.',
    }
  : {
      photos: 'WORN uses the photo you choose to make your try-on avatar.',
      camera: 'WORN uses the camera only if you choose to take a photo for your try-on avatar.',
      calendar: 'WORN doesn’t read your calendar in this version of the app.',
    };

/** Android permissions Worn Play never uses: removed from the merged manifest. */
const PLAY_BLOCKED_PERMISSIONS = [
  'android.permission.READ_CALENDAR',
  'android.permission.WRITE_CALENDAR',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.SYSTEM_ALERT_WINDOW',
];

function withPermissionCopy(plugin) {
  const [name, options] = Array.isArray(plugin) ? plugin : [plugin, undefined];
  if (name === 'expo-image-picker') {
    return [name, { ...options, photosPermission: PERMISSION_COPY.photos, cameraPermission: PERMISSION_COPY.camera }];
  }
  if (name === 'expo-calendar') {
    return [name, { ...options, calendarPermission: PERMISSION_COPY.calendar }];
  }
  return plugin;
}

const plugins = appJson.expo.plugins.map(withPermissionCopy);
if (sentryDsn) {
  // Source maps upload during the EAS build when SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT
  // are set (docs/EAS.md).
  plugins.push(
    env.SENTRY_ORG && env.SENTRY_PROJECT
      ? ['@sentry/react-native', { organization: env.SENTRY_ORG, project: env.SENTRY_PROJECT }]
      : '@sentry/react-native',
  );
}

// The API address comes from the environment only (Plan #4). A release build without a public
// https address (production: the production API itself), or without the Google client id of the
// platform it builds, fails here, before anything is built.
const apiUrl = env.EXPO_PUBLIC_API_URL?.trim() || undefined;
if (isReleaseBuild(env)) {
  const profile = env.EAS_BUILD_PROFILE ?? 'release';
  const apiProblem = profileApiUrlProblem(apiUrl, env.EAS_BUILD_PROFILE);
  const { errors, warnings } = releaseSettingsProblems(env);
  if (apiProblem) errors.unshift(apiProblem);
  for (const warning of warnings) console.warn(`[app.config] ${profile} build: ${warning}`);
  if (errors.length > 0) {
    throw new Error(`[app.config] ${profile} build:\n- ${errors.join('\n- ')}`);
  }
}

const android = appJson.expo.android;
const blockedPermissions = closetOn
  ? android.blockedPermissions
  : [...new Set([...android.blockedPermissions, ...PLAY_BLOCKED_PERMISSIONS])];
const permissions = android.permissions.filter((p) => !blockedPermissions.includes(p));

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...appJson.expo,
    plugins,
    android: { ...android, permissions, blockedPermissions },
    extra: { ...appJson.expo.extra, ...(apiUrl ? { apiUrl } : {}) },
  },
};
