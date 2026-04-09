import { resolveBackendUrl } from "./backendResolution";
import { devLog } from "./devLog";

/** Public HTTPS API base URL (no trailing slash). See `backendResolution.js` for precedence. */
export const BACKEND_URL = resolveBackendUrl();

devLog("[ClaroDoc] BACKEND_URL =", BACKEND_URL);
