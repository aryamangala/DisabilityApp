/**
 * Public API URL must be reachable from real devices (HTTPS).
 * `*.railway.internal` is only for other Railway services, not phones or browsers.
 * If requests fail, copy the exact "Public Networking" URL from Railway (often *.up.railway.app).
 */
const defaultRemoteBackend =
  process.env.EXPO_PUBLIC_BACKEND_URL?.trim() ||
  "https://disabilityapp.up.railway.app";

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
