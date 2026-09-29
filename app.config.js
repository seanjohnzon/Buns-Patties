// Two apps from one codebase:
//
//   default                  "B&P Test" — com.bunsandpatties.app.preview. The test
//                            app: runs on the test database on the phone. This is
//                            what a plain clone builds, so anyone with an Apple
//                            developer account can build it and send it to
//                            TestFlight with no settings (see SAMIL.md).
//   APP_VARIANT=production   "Buns & Patties" — com.bunsandpatties.app. The real
//                            app and the live website. Never in test mode.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT === 'production') {
    return { ...config, extra: { ...config.extra, testMode: false } };
  }
  return {
    ...config,
    name: 'B&P Test',
    ios: { ...config.ios, bundleIdentifier: 'com.bunsandpatties.app.preview' },
    android: { ...config.android, package: 'com.bunsandpatties.app.preview' },
    extra: { ...config.extra, testMode: true },
  };
};
