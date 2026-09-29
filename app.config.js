// app.json holds the real app (the owner's, for the App Store). APP_VARIANT
// switches the build that goes to TestFlight before the owner's Apple account
// exists: it is signed on Samil's team, so it needs its own bundle id and name —
// the real id stays free for the owner's account. See docs/TESTFLIGHT.md.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'preview') return config;
  return {
    ...config,
    name: 'B&P Test',
    ios: { ...config.ios, bundleIdentifier: 'com.bunsandpatties.app.preview' },
    android: { ...config.android, package: 'com.bunsandpatties.app.preview' },
  };
};
