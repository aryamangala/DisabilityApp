/**
 * User-facing and dev-only messages when the API cannot be reached.
 */

export function getBackendUnreachableMessage(error, backendUrl) {
  if (error?.name === "AbortError") {
    return (
      "This is taking too long. Try again on Wi‑Fi, use fewer pages, or try again in a moment."
    );
  }

  const msg = error?.message || "";
  const looksNetwork =
    msg.includes("Failed to fetch") ||
    msg.includes("NetworkError") ||
    msg.includes("Network request failed");

  if (!looksNetwork) {
    return null;
  }

  if (__DEV__) {
    const hint =
      "Tip: On a physical device use a HTTPS URL (e.g. hosted API) or set EXPO_PUBLIC_BACKEND_URL to your computer’s LAN IP. For emulator/simulator only, set EXPO_PUBLIC_USE_LOCAL_BACKEND=true with API on port 4000.";
    return `Cannot reach the API at ${backendUrl || "(not configured)"}. ${hint}`;
  }

  return (
    "The ClaroDoc service is unavailable or you are offline. Check your internet connection and try again. If it keeps happening, try again later."
  );
}
