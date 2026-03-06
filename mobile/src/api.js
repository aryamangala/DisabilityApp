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
  file // For web: actual File object
}) {
  const formData = new FormData();

  if (title) formData.append("title", title);
  if (language) formData.append("language", language);
  formData.append("inputType", inputType);

  // On web, we need a File/Blob object for FormData
  // On native, use the {uri, name, type} format
  if (Platform.OS === "web") {
    let fileToUpload = file;
    
    console.log("Web file upload - checking file object:", { 
      hasFile: !!file, 
      hasUri: !!uri, 
      uriType: uri?.substring(0, 20),
      name,
      fileSize: file?.size
    });
    
    // Check file size limit (10MB for web uploads)
    const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
    if (fileToUpload && fileToUpload.size > MAX_FILE_SIZE) {
      throw new Error(`File is too large (${Math.round(fileToUpload.size / 1024 / 1024)}MB). Maximum size is 10MB.`);
    }
    
    // If no file object provided, try to fetch from URI and convert to Blob
    if (!fileToUpload && uri) {
      try {
        console.log("Fetching file from URI:", uri.substring(0, 50));
        
        // For blob: URLs, fetch directly
        if (uri.startsWith("blob:")) {
          const response = await fetch(uri);
          if (!response.ok) {
            throw new Error(`Failed to fetch file: ${response.status}`);
          }
          
          // Check content length if available
          const contentLength = response.headers.get("content-length");
          if (contentLength && parseInt(contentLength) > MAX_FILE_SIZE) {
            throw new Error(`File is too large (${Math.round(parseInt(contentLength) / 1024 / 1024)}MB). Maximum size is 10MB.`);
          }
          
          const blob = await response.blob();
          
          // Check blob size
          if (blob.size > MAX_FILE_SIZE) {
            throw new Error(`File is too large (${Math.round(blob.size / 1024 / 1024)}MB). Maximum size is 10MB.`);
          }
          
          fileToUpload = new File([blob], name || "upload", { type: mimeType || "application/octet-stream" });
          console.log("Converted blob to File:", fileToUpload.size, "bytes");
        } else if (uri.startsWith("data:")) {
          // For data URLs, convert directly
          const response = await fetch(uri);
          const blob = await response.blob();
          if (blob.size > MAX_FILE_SIZE) {
            throw new Error(`File is too large (${Math.round(blob.size / 1024 / 1024)}MB). Maximum size is 10MB.`);
          }
          fileToUpload = new File([blob], name || "upload", { type: mimeType || "application/octet-stream" });
        } else {
          throw new Error("Unsupported file URI format. Please try selecting the file again.");
        }
      } catch (e) {
        console.error("Failed to convert URI to File:", e);
        if (e.message.includes("too large")) {
          throw e; // Re-throw size errors as-is
        }
        throw new Error(`Failed to read file: ${e.message}. Please try selecting the file again.`);
      }
    }
    
    if (fileToUpload) {
      console.log("Appending file to FormData:", fileToUpload.name, fileToUpload.size, "bytes");
      formData.append("file", fileToUpload, name || "upload");
    } else {
      throw new Error("No file available to upload. Please select the file again.");
    }
  } else {
    // Native: use React Native format
    console.log("Native file upload:", { uri, name });
    formData.append("file", {
      uri,
      name: name || "upload",
      type: mimeType || "application/octet-stream"
    });
  }

  try {
    console.log("Sending request to:", `${BACKEND_URL}/documents`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    const resp = await fetch(`${BACKEND_URL}/documents`, {
      method: "POST",
      signal: controller.signal,
      // Don't set Content-Type header on web - let browser set it with boundary
      headers: Platform.OS === "web" ? {} : {
        "Content-Type": "multipart/form-data"
      },
      body: formData
    });
    
    clearTimeout(timeoutId);
    console.log("Response status:", resp.status);
    
    return handleResponse(resp);
  } catch (e) {
    console.error("createDocumentFromFile error:", e);
    if (e.name === "AbortError") {
      throw new Error("Upload timed out. The file may be too large or the server is not responding.");
    }
    if (e.message.includes("Failed to fetch") || e.message.includes("NetworkError")) {
      throw new Error(`Cannot connect to backend at ${BACKEND_URL}. Is the server running?`);
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

