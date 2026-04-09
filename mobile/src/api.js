import { Platform } from "react-native";

import { BACKEND_URL } from "./constants";
import { getBackendUnreachableMessage } from "./backendErrors";
import { devError, devLog, devWarn } from "./devLog";

const TEXT_REQUEST_TIMEOUT_MS = 180_000;
const CHUNK_REQUEST_TIMEOUT_MS = 90_000;
const HEALTH_TIMEOUT_MS = 12_000;

function assertBackendConfigured() {
  if (
    !BACKEND_URL ||
    typeof BACKEND_URL !== "string" ||
    !/^https?:\/\//i.test(BACKEND_URL.trim())
  ) {
    throw new Error(
      __DEV__
        ? "API URL is not configured. Set EXPO_PUBLIC_BACKEND_URL or defaultPublicBackend.json."
        : "The app could not reach its service. Please try again later."
    );
  }
}

function rethrowApiNetworkError(err) {
  const msg = getBackendUnreachableMessage(err, BACKEND_URL);
  if (msg) throw new Error(msg);
  throw err;
}

async function handleResponse(resp) {
  let data = null;
  let rawText = null;
  
  try {
    rawText = await resp.text(); // Get raw text first
    if (rawText) {
      data = JSON.parse(rawText);
    }
  } catch (e) {
    devWarn("Failed to parse JSON response:", e);
    // If it's not JSON, use the raw text as the error message
    if (rawText && rawText.trim()) {
      data = { error: rawText.trim() };
    }
  }

  if (!resp.ok) {
    let message = `Request failed with status ${resp.status}`;
    
    // Handle rate limiting specifically
    if (resp.status === 429) {
      message = data?.error || "Too many requests. Please wait a moment and try again.";
    } else if (data && data.error) {
      message = data.error;
    } else if (rawText) {
      message = rawText.trim();
    }
    
    const error = new Error(message);
    error.status = resp.status;
    throw error;
  }
  return data;
}

function isRetryableChunkError(err) {
  if (err?.name === "AbortError") return true;
  return Boolean(getBackendUnreachableMessage(err, BACKEND_URL));
}

const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

async function webUriToFile(uri, fallbackName, mimeType) {
  const response = await fetch(uri);
  if (!response.ok) {
    throw new Error(`Failed to fetch file: ${response.status}`);
  }
  const contentLength = response.headers.get("content-length");
  if (contentLength && parseInt(contentLength, 10) > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File is too large (${Math.round(parseInt(contentLength, 10) / 1024 / 1024)}MB). Maximum size is 10MB.`
    );
  }
  const blob = await response.blob();
  if (blob.size > MAX_UPLOAD_BYTES) {
    throw new Error(
      `File is too large (${Math.round(blob.size / 1024 / 1024)}MB). Maximum size is 10MB.`
    );
  }
  return new File([blob], fallbackName || "upload", {
    type: mimeType || "application/octet-stream"
  });
}

export async function createDocumentFromText({ title, language, text }) {
  assertBackendConfigured();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TEXT_REQUEST_TIMEOUT_MS);
  try {
    devLog("Calling backend:", `${BACKEND_URL}/documents`);
    const resp = await fetch(`${BACKEND_URL}/documents`, {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title, language, text })
    });
    return await handleResponse(resp);
  } catch (e) {
    devError("createDocumentFromText error:", e);
    if (e.name === "AbortError") {
      throw new Error(
        "Processing this text is taking too long. Try a shorter passage or check your connection."
      );
    }
    rethrowApiNetworkError(e);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function createDocumentFromFile({
  title,
  language,
  uri,
  name,
  inputType,
  mimeType,
  file,
  imagePages
}) {
  const formData = new FormData();

  if (title) formData.append("title", title);
  if (language) formData.append("language", language);
  formData.append("inputType", inputType);

  const useMultiImage =
    inputType === "image" &&
    Array.isArray(imagePages) &&
    imagePages.length > 0;

  assertBackendConfigured();

  if (Platform.OS === "web") {
    if (useMultiImage) {
      for (let i = 0; i < imagePages.length; i++) {
        const p = imagePages[i];
        let fileToUpload = p.file;
        if (!fileToUpload && p.uri) {
          if (p.uri.startsWith("blob:") || p.uri.startsWith("data:")) {
            fileToUpload = await webUriToFile(
              p.uri,
              p.name || `page_${i + 1}.jpg`,
              p.mimeType || "image/jpeg"
            );
          } else {
            throw new Error(
              "Unsupported image URI. Please capture pages again."
            );
          }
        }
        if (fileToUpload && fileToUpload.size > MAX_UPLOAD_BYTES) {
          throw new Error(`Page ${i + 1} is too large (max 10MB per page).`);
        }
        if (!fileToUpload) {
          throw new Error(`Page ${i + 1} could not be read.`);
        }
        formData.append(
          "files",
          fileToUpload,
          p.name || `page_${i + 1}.jpg`
        );
      }
    } else {
      let fileToUpload = file;

      if (fileToUpload && fileToUpload.size > MAX_UPLOAD_BYTES) {
        throw new Error(
          `File is too large (${Math.round(fileToUpload.size / 1024 / 1024)}MB). Maximum size is 10MB.`
        );
      }

      if (!fileToUpload && uri) {
        try {
          if (uri.startsWith("blob:") || uri.startsWith("data:")) {
            fileToUpload = await webUriToFile(
              uri,
              name || "upload",
              mimeType || "application/octet-stream"
            );
          } else {
            throw new Error(
              "Unsupported file URI format. Please try selecting the file again."
            );
          }
        } catch (e) {
          if (e.message.includes("too large")) throw e;
          throw new Error(
            `Failed to read file: ${e.message}. Please try selecting the file again.`
          );
        }
      }

      if (!fileToUpload) {
        throw new Error(
          "No file available to upload. Please select the file again."
        );
      }

      formData.append("file", fileToUpload, name || "upload");
    }
  } else if (useMultiImage) {
    imagePages.forEach((p, i) => {
      formData.append("files", {
        uri: p.uri,
        name: p.name || `page_${i + 1}.jpg`,
        type: p.mimeType || "image/jpeg"
      });
    });
  } else {
    formData.append("file", {
      uri,
      name: name || "upload",
      type: mimeType || "application/octet-stream"
    });
  }

  const pageCount = useMultiImage ? imagePages.length : 1;
  // Server runs OCR (OpenAI) per page before HTTP responds — must cover upload + all pages.
  const uploadTimeoutMs =
    inputType === "image"
      ? Math.min(1_800_000, 120_000 + pageCount * 240_000) // up to 30 min; ~4 min/page
      : 180_000; // PDF parse is local on server; 3 min is enough for upload + parse

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), uploadTimeoutMs);

  try {
    devLog("[ClaroDoc] POST /documents →", BACKEND_URL, {
      inputType,
      pages: pageCount,
      timeoutMs: uploadTimeoutMs,
    });
    const resp = await fetch(`${BACKEND_URL}/documents`, {
      method: "POST",
      signal: controller.signal,
      headers: {},
      body: formData
    });

    devLog("Response status:", resp.status);

    return handleResponse(resp);
  } catch (e) {
    devError("createDocumentFromFile error:", e);
    if (e.name === "AbortError") {
      throw new Error(
        "This is taking too long (reading photos on the server can be slow). Try fewer or clearer pages, use Wi‑Fi, or try again in a moment."
      );
    }
    rethrowApiNetworkError(e);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function fetchChunk(docId, index, attempt = 0) {
  assertBackendConfigured();
  const url = `${BACKEND_URL}/documents/${encodeURIComponent(docId)}/chunks/${index}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CHUNK_REQUEST_TIMEOUT_MS);
  try {
    const resp = await fetch(url, { signal: controller.signal });
    return await handleResponse(resp);
  } catch (e) {
    if (e?.status === 404) {
      throw new Error(
        "That section is no longer on the server. If you saved this document on the device, open it from Previous Files."
      );
    }
    if (attempt < 1 && isRetryableChunkError(e)) {
      await new Promise((r) => setTimeout(r, 900));
      return fetchChunk(docId, index, attempt + 1);
    }
    if (e.name === "AbortError") {
      throw new Error(
        "Loading this section took too long. Check your connection and try again."
      );
    }
    rethrowApiNetworkError(e);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function checkHealth() {
  assertBackendConfigured();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const resp = await fetch(`${BACKEND_URL}/health`, { signal: controller.signal });
    return await handleResponse(resp);
  } catch (e) {
    if (e.name === "AbortError") {
      throw new Error(
        "The service did not respond in time. You may be offline or the server is busy."
      );
    }
    rethrowApiNetworkError(e);
  } finally {
    clearTimeout(timeoutId);
  }
}

