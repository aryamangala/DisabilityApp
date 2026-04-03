import { Platform } from "react-native";
import Constants from "expo-constants";

import defaults from "../defaultPublicBackend.json";
import { isStaleRailwayBackendUrl } from "./backendUrlEnv";

function normalizeBaseUrl(url) {
	if (!url || typeof url !== "string") return url;
	return url.trim().replace(/\/+$/, "");
}

/** Resolve `extra` — Expo Go + Metro sometimes omit `expoConfig.extra`; try fallbacks. */
function readConfigExtra() {
	const ec = Constants.expoConfig;
	if (ec?.extra && typeof ec.extra === "object") {
		return ec.extra;
	}
	const m = Constants.manifest;
	if (m?.extra && typeof m.extra === "object") {
		return m.extra;
	}
	const m2 = Constants.manifest2;
	const nested = m2?.extra?.expoClient?.extra;
	if (nested && typeof nested === "object") {
		return nested;
	}
	return null;
}

// EAS / Metro: .env or eas.json (inlined at bundle time).
const rawEnvBackend = process.env.EXPO_PUBLIC_BACKEND_URL;
if (__DEV__ && isStaleRailwayBackendUrl(rawEnvBackend)) {
	console.warn(
		"[EasyRead] EXPO_PUBLIC_BACKEND_URL points at a retired Railway host; using defaultPublicBackend.json instead."
	);
}
const envBackendUrl = normalizeBaseUrl(
	isStaleRailwayBackendUrl(rawEnvBackend) ? undefined : rawEnvBackend
);

const rawExtraBackend = readConfigExtra()?.backendUrl;
const extraBackendUrl = normalizeBaseUrl(
  isStaleRailwayBackendUrl(rawExtraBackend) ? undefined : rawExtraBackend
);

const fileDefaultBackendUrl = normalizeBaseUrl(defaults.backendUrl);

const localDefault = normalizeBaseUrl(
	Platform.select({
		android: "http://10.0.2.2:4000",
		default: "http://localhost:4000",
	})
);

// Prefer env → manifest extra → bundled JSON default → local (simulator only).
// Without the JSON default, Expo Go on a real device often fell back to localhost and every fetch failed.
export const BACKEND_URL =
	envBackendUrl ||
	extraBackendUrl ||
	fileDefaultBackendUrl ||
	localDefault;

if (__DEV__) {
	console.log("[EasyRead] BACKEND_URL =", BACKEND_URL);
}
