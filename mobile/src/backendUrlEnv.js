/**
 * Old hostname returns Railway edge 404 "Application not found" (not our API).
 * Ignore it so defaultPublicBackend.json / eas.json wins.
 */
export function isStaleRailwayBackendUrl(url) {
  if (url == null || typeof url !== "string" || !url.trim()) return false;
  const u = url.trim().replace(/\/+$/, "").toLowerCase();
  return (
    u === "https://disabilityapp.up.railway.app" ||
    u === "http://disabilityapp.up.railway.app"
  );
}

/**
 * URLs that are OK for Expo/Metro on a dev machine but must never ship in
 * production, internal, or store builds (testers cannot reach them).
 */
export function isDevelopmentOnlyBackendUrl(url) {
  if (url == null || typeof url !== "string" || !url.trim()) return false;
  let host = "";
  try {
    const parsed = new URL(url.trim());
    host = (parsed.hostname || "").toLowerCase();
  } catch {
    const u = url.trim().toLowerCase();
    return (
      u.includes("ngrok") ||
      u.includes("localtunnel") ||
      u.includes("loca.lt") ||
      u.includes("serveo.net")
    );
  }

  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "0.0.0.0" ||
    host === "::1" ||
    host === "10.0.2.2" ||
    host.endsWith(".local") ||
    host.endsWith(".localhost") ||
    host.includes("ngrok") ||
    host.includes("localtunnel") ||
    host.endsWith(".loca.lt") ||
    host.includes("trycloudflare.com") ||
    host.includes("serveo.net")
  ) {
    return true;
  }

  // Android emulator / genymotion-style aliases
  if (/^10\.0\.3\.2$/.test(host)) return true;

  // RFC1918 — LAN dev servers (192.168.x, 10.x, 172.16–31.x)
  if (/^192\.168\./.test(host)) return true;
  if (/^10\./.test(host)) return true;
  const m172 = /^172\.(\d+)\./.exec(host);
  if (m172) {
    const second = parseInt(m172[1], 10);
    if (second >= 16 && second <= 31) return true;
  }

  return false;
}
