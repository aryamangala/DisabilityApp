import { Platform } from "react-native";
import Constants from "expo-constants";

function normalizeBaseUrl(url) {
	if (!url || typeof url !== "string") return url;
	return url.trim().replace(/\/+$/, "");
}

// EAS / Metro: EXPO_PUBLIC_BACKEND_URL overrides everything (set in eas.json or .env).
const envBackendUrl = normalizeBaseUrl(process.env.EXPO_PUBLIC_BACKEND_URL);

// app.config.js extra.backendUrl — baked into dev client and release builds.
const extraBackendUrl = normalizeBaseUrl(Constants.expoConfig?.extra?.backendUrl);

const localDefault = normalizeBaseUrl(
	Platform.select({
		android: "http://10.0.2.2:4000",
		default: "http://localhost:4000",
	})
);

export const BACKEND_URL = envBackendUrl || extraBackendUrl || localDefault;
