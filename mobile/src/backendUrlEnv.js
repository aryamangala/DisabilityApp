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
