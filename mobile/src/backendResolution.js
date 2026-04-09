import { Platform } from "react-native";
import Constants from "expo-constants";

import defaults from "../defaultPublicBackend.json";
import {
  isStaleRailwayBackendUrl,
  isDevelopmentOnlyBackendUrl,
} from "./backendUrlEnv";
import { devWarn } from "./devLog";

function normalizeBaseUrl(url) {
  if (!url || typeof url !== "string") return "";
  return url.trim().replace(/\/+$/, "");
}

/** Expo Go + Metro sometimes omit `expoConfig.extra`; try fallbacks. */
function readConfigExtra() {
  const ec = Constants.expoConfig;
  if (ec?.extra && typeof ec.extra === "object") return ec.extra;
  const m = Constants.manifest;
  if (m?.extra && typeof m.extra === "object") return m.extra;
  const m2 = Constants.manifest2;
  const nested = m2?.extra?.expoClient?.extra;
  if (nested && typeof nested === "object") return nested;
  return null;
}

function simulatorLocalBackendUrl() {
  return normalizeBaseUrl(
    Platform.select({
      android: "http://10.0.2.2:4000",
      default: "http://127.0.0.1:4000",
    })
  );
}

/**
 * Picks API base URL for the current build + runtime.
 *
 * Expo/EAS: only `EXPO_PUBLIC_*` vars are inlined at bundle time. Set them in:
 * - `.env` / `.env.local` for `npx expo start`
 * - `eas.json` → `build.*.env` for store & internal tester builds
 *
 * Order (release): env → app.config extra → defaultPublicBackend.json (dev URLs rejected)
 * Order (dev): env → extra → [`EXPO_PUBLIC_USE_LOCAL_BACKEND=true`] simulator URL → bundled default
 */
export function resolveBackendUrl() {
  const fileDefault = normalizeBaseUrl(defaults.backendUrl);
  const isRelease = !__DEV__;

  const rawEnv = normalizeBaseUrl(process.env.EXPO_PUBLIC_BACKEND_URL);
  const rawExtra = normalizeBaseUrl(readConfigExtra()?.backendUrl);
  const useLocalFlag =
    process.env.EXPO_PUBLIC_USE_LOCAL_BACKEND === "true" ||
    process.env.EXPO_PUBLIC_USE_LOCAL_BACKEND === "1";

  function accept(url) {
    if (!url) return null;
    if (isStaleRailwayBackendUrl(url)) return null;
    if (isRelease && isDevelopmentOnlyBackendUrl(url)) {
      devWarn(
        "[ClaroDoc] Ignoring development-only API URL in a release build. Using the bundled public default instead."
      );
      return null;
    }
    return url;
  }

  const tryOrder = [];
  if (rawEnv) tryOrder.push(() => accept(rawEnv));
  if (rawExtra) tryOrder.push(() => accept(rawExtra));
  if (__DEV__ && useLocalFlag && !rawEnv) {
    tryOrder.push(() => accept(simulatorLocalBackendUrl()));
  }
  tryOrder.push(() => accept(fileDefault));

  if (__DEV__) {
    const envRawForWarn = process.env.EXPO_PUBLIC_BACKEND_URL?.trim();
    if (envRawForWarn && isStaleRailwayBackendUrl(envRawForWarn)) {
      devWarn(
        "[ClaroDoc] EXPO_PUBLIC_BACKEND_URL points at a retired Railway host; using another source."
      );
    }
  }

  for (const pick of tryOrder) {
    const u = pick();
    if (u) {
      if (isRelease && /^http:\/\//i.test(u)) {
        devWarn(
          "[ClaroDoc] API URL uses HTTP in a release build. Prefer HTTPS for store review and testers."
        );
      }
      return u;
    }
  }

  if (__DEV__) {
    devWarn(
      "[ClaroDoc] No valid API URL resolved; falling back to bundled default or local simulator URL."
    );
    return fileDefault || simulatorLocalBackendUrl();
  }

  return fileDefault;
}
