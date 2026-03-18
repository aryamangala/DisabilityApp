import { Platform } from "react-native";

// Optional override for LAN/physical device testing, e.g. EXPO_PUBLIC_BACKEND_URL=http://192.168.1.20:4000
const envBackendUrl = process.env.EXPO_PUBLIC_BACKEND_URL;

const defaultBackendUrl = Platform.select({
	android: "http://10.0.2.2:4000",
	default: "http://localhost:4000"
});

export const BACKEND_URL = envBackendUrl || defaultBackendUrl;

