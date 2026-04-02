/**
 * Public API URL must be reachable from real devices (HTTPS).
 * `*.railway.internal` is only for other Railway services, not phones or browsers.
 * Change the URL in `defaultPublicBackend.json` (and keep `eas.json` in sync for EAS builds).
 */
// eslint-disable-next-line import/no-commonjs -- app.config is evaluated in Node by Expo CLI
const { backendUrl: fallbackFromFile } = require("./defaultPublicBackend.json");

const defaultRemoteBackend =
  process.env.EXPO_PUBLIC_BACKEND_URL?.trim() || fallbackFromFile;

export default {
  expo: {
    name: "EasyRead",
    slug: "easyread",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    assetBundlePatterns: ["**/*"],
    ios: {
      bundleIdentifier: "com.easyread.app",
      supportsTablet: true,
    },
    android: {
      package: "com.easyread.app",
    },
    web: {
      bundler: "metro",
    },
    plugins: ["expo-document-picker", "expo-image-picker", "expo-asset"],
    extra: {
      backendUrl: defaultRemoteBackend,
    },
  },
};
