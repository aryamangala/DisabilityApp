/**
 * Public API URL must be reachable from real devices (HTTPS).
 * Runtime resolution: see `src/backendResolution.js` (EAS: set EXPO_PUBLIC_BACKEND_URL in eas.json).
 *
 * Dev helpers (Metro only): `.env` may set EXPO_PUBLIC_BACKEND_URL or
 * EXPO_PUBLIC_USE_LOCAL_BACKEND=true for simulator/emulator → port 4000 on host.
 *
 * `*.railway.internal` is only for other Railway services, not phones or browsers.
 */
// eslint-disable-next-line import/no-commonjs -- app.config is evaluated in Node by Expo CLI
const { backendUrl: fallbackFromFile } = require("./defaultPublicBackend.json");
const { isStaleRailwayBackendUrl } = require("./src/backendUrlEnv.js");

const envRaw = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
const defaultRemoteBackend =
  envRaw && !isStaleRailwayBackendUrl(envRaw) ? envRaw : fallbackFromFile;

/** EAS sets this during builds; omit Bonjour/local-network plist entries on store builds. */
const easProfile = process.env.EAS_BUILD_PROFILE || "";
const isDevClientProfile = easProfile === "development";

export default {
  expo: {
    name: "ClaroDoc",
    slug: "clarodoc",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    icon: "./assets/icon.png",
    splash: {
      image: "./assets/splash.png",
      resizeMode: "contain",
      backgroundColor: "#F5F1E8",
    },
    assetBundlePatterns: ["**/*"],
    ios: {
      bundleIdentifier: "com.easyread.app",
      supportsTablet: true,
      buildNumber: "1",
      infoPlist: {
        ...(isDevClientProfile
          ? {
              NSLocalNetworkUsageDescription:
                "ClaroDoc uses your local network in debug builds to load JavaScript from the development server on your Mac.",
              NSBonjourServices: ["_expo-development-server._tcp"],
            }
          : {}),
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
    },
    android: {
      package: "com.easyread.app",
      // Bump for every Play upload (or manage via EAS remote version if you prefer).
      versionCode: 1,
      usesCleartextTraffic: true,
      // Microphone is not used (see expo-image-picker `microphonePermission: false`); strip if any dep merges it.
      blockedPermissions: ["android.permission.RECORD_AUDIO"],
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon-foreground.png",
        backgroundColor: "#F5F1E8",
      },
    },
    web: {
      bundler: "metro",
    },
    plugins: [
      "expo-document-picker",
      [
        "expo-image-picker",
        {
          // App only uses launchCameraAsync (ImportScreen) — not the photo library or video/mic.
          photosPermission: false,
          microphonePermission: false,
          cameraPermission:
            "ClaroDoc needs camera access to photograph documents so text can be extracted and simplified.",
        },
      ],
      "expo-asset",
    ],
    extra: {
      /**
       * EAS Build: run `npx eas-cli init` in /mobile (adds `eas.projectId` here), or set
       * EAS_PROJECT_ID in `.env` so this config can read it at build time.
       */
      ...(process.env.EAS_PROJECT_ID?.trim()
        ? { eas: { projectId: process.env.EAS_PROJECT_ID.trim() } }
        : {}),
      backendUrl: defaultRemoteBackend,
    },
  },
};
