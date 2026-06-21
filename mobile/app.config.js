// Dynamic Expo config.
//
// Keeps the Google Maps Android API key OUT of the committed app.json (this
// repo is public, and a hardcoded key trips GitHub secret scanning). The key
// is injected at config-evaluation time from an environment variable:
//   - Local builds (expo run / prebuild): mobile/.env.local (gitignored)
//   - EAS builds: an EAS environment variable / secret named the same
//
// Everything else still lives in app.json, which Expo passes in as `config`.
module.exports = ({ config }) => ({
  ...config,
  android: {
    ...config.android,
    config: {
      ...(config.android && config.android.config),
      googleMaps: {
        apiKey: process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      },
    },
  },
});
