import { BACKEND_URL } from "./constants";
import { Platform } from "react-native";

async function handleResponse(resp) {
  let data = null;
  let rawText = null;
  
  try {
    rawText = await resp.text(); // Get raw text first
    if (rawText) {
      data = JSON.parse(rawText);
    }
  } catch (e) {
    console.warn("Failed to parse JSON response:", e);
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
  try {
    console.log("Calling backend:", `${BACKEND_URL}/documents`);
    const resp = await fetch(`${BACKEND_URL}/documents`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ title, language, text })
    });
    return handleResponse(resp);
  } catch (e) {
    console.error("createDocumentFromText error:", e);
    if (e.message.includes("Failed to fetch") || e.message.includes("NetworkError")) {
      throw new Error(`Cannot connect to backend at ${BACKEND_URL}. Is the server running?`);
    }
    throw e;
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
  const uploadTimeoutMs = Math.min(
    900000,
    inputType === "image" ? 90000 + pageCount * 120000 : 120000
  );

  try {
    console.log("Sending request to:", `${BACKEND_URL}/documents`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), uploadTimeoutMs);

    const resp = await fetch(`${BACKEND_URL}/documents`, {
      method: "POST",
      signal: controller.signal,
      headers: {},
      body: formData
    });

    clearTimeout(timeoutId);
    console.log("Response status:", resp.status);

    return handleResponse(resp);
  } catch (e) {
    console.error("createDocumentFromFile error:", e);
    if (e.name === "AbortError") {
      throw new Error(
        "Upload timed out. Try fewer pages or a stronger connection."
      );
    }
    if (
      e.message.includes("Failed to fetch") ||
      e.message.includes("NetworkError")
    ) {
      throw new Error(
        `Cannot connect to backend at ${BACKEND_URL}. Is the server running?`
      );
    }
    throw e;
  }
}

export async function fetchChunk(docId, index) {
  const resp = await fetch(
    `${BACKEND_URL}/documents/${encodeURIComponent(docId)}/chunks/${index}`
  );
  return handleResponse(resp);
}

// Quiz functionality removed

export async function fetchAllDocuments() {
  const resp = await fetch(`${BACKEND_URL}/documents`);
  return handleResponse(resp);
}

export async function fetchDocumentDetails(docId) {
  const resp = await fetch(`${BACKEND_URL}/documents/${encodeURIComponent(docId)}`);
  return handleResponse(resp);
}

export async function deleteAllDocuments() {
  const resp = await fetch(`${BACKEND_URL}/documents`, {
    method: "DELETE"
  });
  return handleResponse(resp);
}

export async function deleteDocument(docId) {
  const resp = await fetch(`${BACKEND_URL}/documents/${encodeURIComponent(docId)}`, {
    method: "DELETE"
  });
  return handleResponse(resp);
}

export async function checkHealth() {
  const resp = await fetch(`${BACKEND_URL}/health`);
  return handleResponse(resp);
}

