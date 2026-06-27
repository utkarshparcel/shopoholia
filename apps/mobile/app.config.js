const appJson = require('./app.json');

const sentryDsn = process.env.EXPO_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN;

const plugins = [...appJson.expo.plugins];
if (sentryDsn) {
  plugins.push('@sentry/react-native');
}

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  expo: {
    ...appJson.expo,
    plugins,
  },
};
