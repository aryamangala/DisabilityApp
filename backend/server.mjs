import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

import {
  removeHeadersFooters,
  normalizeLines,
  chunkText,
  deriveHeading
} from "./textUtils.mjs";
import { ocrImageToText, generateEasyRead } from "./openaiClient.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

// Railway / reverse proxy: correct client IP for logs and rate limits
app.set("trust proxy", 1);

const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  : [];
app.use(
  cors(
    corsOrigins.length
      ? { origin: corsOrigins }
      : {
          // Mobile apps typically send no Origin; allow non-browser clients.
          origin: (origin, cb) => cb(null, true),
        }
  )
);
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // per file
    files: 25
  }
});

const documentUpload = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "files", maxCount: 24 }
]);

function documentUploadWithErrorLogging(req, res, next) {
  documentUpload(req, res, (err) => {
    if (err) {
      console.error("[POST /documents] multer error:", err.code || err.name, err.message);
      const status = err.code === "LIMIT_FILE_SIZE" ? 413 : 400;
      return res.status(status).json({
        error:
          err.code === "LIMIT_FILE_SIZE"
            ? "One or more files exceed the 10MB per-file limit."
            : err.message || "Upload could not be read."
      });
    }
    next();
  });
}

const isProduction = process.env.NODE_ENV === "production";
/** Verbose request tracing (off in production unless LOG_VERBOSE=true). */
const logVerbose = !isProduction || process.env.LOG_VERBOSE === "true";
function devLog(...args) {
  if (logVerbose) console.log(...args);
}
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: isProduction ? 120 : 500,
  standardHeaders: true,
  legacyHeaders: false,
  message: JSON.stringify({ error: "Too many requests. Please wait a moment and try again." }),
  skip: (req) => {
    const ip = req.ip || "";
    return (
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip.startsWith("::ffff:127.0.0.1")
    );
  },
});
app.use(limiter);

/**
 * Ephemeral document store.
 *
 * Goal: do NOT persist original files or translated content (no DB writes).
 * We keep results in memory for the current session so the mobile app can fetch
 * chunks by index after /documents returns docId + chunkCount.
 *
 * Cleanup: TTL-based eviction to avoid unbounded memory growth.
 */
const EPHEMERAL_DOC_TTL_MS = 60 * 60 * 1000; // 1 hour
const ephemeralDocs = new Map(); // docId -> { createdAtMs, language, chunks: [{ heading, originalText, easyread }] }

function pruneEphemeralDocs(nowMs = Date.now()) {
  for (const [docId, value] of ephemeralDocs.entries()) {
    if (!value?.createdAtMs || nowMs - value.createdAtMs > EPHEMERAL_DOC_TTL_MS) {
      ephemeralDocs.delete(docId);
    }
  }
}

function generateDocId() {
  return crypto.randomBytes(12).toString("hex");
}

function cleanAndChunk(rawText) {
  // Optimized: skip expensive operations for very short texts
  if (!rawText || rawText.trim().length < 500) {
    const chunks = chunkText(rawText);
    return { normalized: rawText, chunks };
  }
  
  const noHeaders = removeHeadersFooters(rawText);
  const normalized = normalizeLines(noHeaders);
  const chunks = chunkText(normalized);
  return { normalized, chunks };
}

function createEphemeralDocument({ language, text }) {
  pruneEphemeralDocs();
  const docId = generateDocId();
  const { chunks } = cleanAndChunk(text);

  const payload = {
    createdAtMs: Date.now(),
    language: language || "auto",
    chunks: chunks.map((chunk) => ({
      heading: deriveHeading(chunk),
      originalText: chunk,
      easyread: null
    }))
  };

  ephemeralDocs.set(docId, payload);
  return { docId, chunkCount: payload.chunks.length };
}

function mimeFromFilename(name) {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

if (process.env.ALLOW_DIAGNOSTICS === "true") {
  app.get("/test-openai", async (req, res) => {
    try {
      if (!process.env.OPENAI_API_KEY) {
        return res.status(500).json({ error: "OPENAI_API_KEY not set" });
      }
      const testResult = await generateEasyRead("This is a test sentence.", "en");
      res.json({ success: true, result: testResult });
    } catch (err) {
      console.error("OpenAI test failed:", err);
      res.status(500).json({ error: "Diagnostic request failed." });
    }
  });
}

app.post(
  "/documents",
  (req, res, next) => {
    devLog("[POST /documents] request started", {
      ts: new Date().toISOString(),
      contentType: req.headers["content-type"],
      contentLength: req.headers["content-length"],
      ip: req.ip,
      host: req.headers.host
    });
    next();
  },
  documentUploadWithErrorLogging,
  async (req, res) => {
    try {
      const contentType = req.headers["content-type"] || "";

      if (contentType.includes("application/json")) {
        const { title, language = "auto", text } = req.body || {};
        if (!text || typeof text !== "string" || !text.trim()) {
          return res.status(400).json({
            error: "Missing 'text' in request body."
          });
        }

        // Skip sensitive content check for speed - can be re-enabled if needed
        // const sensitive = await isContentHighlySensitive(text);
        // if (sensitive) { ... }

        const { docId, chunkCount } = createEphemeralDocument({
          language,
          text
        });

        return res.json({ docId, chunkCount });
      }

      if (!contentType.includes("multipart/form-data")) {
        return res.status(400).json({
          error:
            "Unsupported Content-Type. Use application/json or multipart/form-data."
        });
      }

      const fileField = req.files?.file?.[0];
      const filesField = req.files?.files || [];
      const { title, language = "auto", inputType } = req.body || {};

      devLog("File upload received:", {
        hasSingleFile: !!fileField,
        multiCount: filesField.length,
        inputType
      });

      if (inputType !== "pdf" && inputType !== "image") {
        return res
          .status(400)
          .json({ error: "inputType must be 'pdf' or 'image'." });
      }

      devLog("Starting text extraction for:", inputType);
      let extractedText = "";

      if (inputType === "pdf") {
        if (!fileField) {
          console.error("No PDF file received");
          return res.status(400).json({ error: "Missing file field." });
        }
        devLog("Parsing PDF, size:", fileField.buffer.length, "bytes");
        const pdfData = await pdfParse(fileField.buffer);
        extractedText = (pdfData.text || "").trim();
        devLog("PDF text extracted, length:", extractedText.length);

        if (extractedText.length < 200) {
          return res.status(400).json({
            error:
              "This PDF appears to be scanned or image-based. " +
              "Scanned PDFs are not supported in this version. " +
              "Please upload a text-based PDF or a clear photo of the document."
          });
        }
      } else if (inputType === "image") {
        const imageBuffers =
          filesField.length > 0 ? filesField : fileField ? [fileField] : [];
        if (imageBuffers.length === 0) {
          return res.status(400).json({
            error: "Missing image file(s). Send one 'file' or multiple 'files' parts."
          });
        }
        if (imageBuffers.length > 24) {
          return res.status(400).json({
            error: "Too many images (maximum 24 pages per document)."
          });
        }

        devLog("Processing image OCR, page count:", imageBuffers.length);
        const parts = [];
        for (let i = 0; i < imageBuffers.length; i++) {
          const img = imageBuffers[i];
          const mimeType = img.mimetype || mimeFromFilename(img.originalname);
          const base64 = img.buffer.toString("base64");
          if (i > 0) {
            await new Promise((r) => setTimeout(r, 400));
          }
          const pageText = await ocrImageToText(base64, mimeType);
          parts.push(
            `\n\n--- Page ${i + 1} ---\n\n${(pageText || "").trim()}`
          );
        }
        extractedText = parts.join("\n").trim();
        devLog("OCR combined length:", extractedText.length);
      }

      if (!extractedText || extractedText.trim().length < 20) {
        return res.status(400).json({
          error:
            "Unable to extract enough text from this file. " +
            "Please try a clearer document."
        });
      }

      // Skip sensitive content check for speed - can be re-enabled if needed
      // const sensitive = await isContentHighlySensitive(extractedText);
      // if (sensitive) { ... }

      devLog("Storing document and chunks...");
      const fallbackName =
        inputType === "pdf"
          ? fileField?.originalname
          : (filesField[0] || fileField)?.originalname;
      const { docId, chunkCount } = createEphemeralDocument({
        language,
        text: extractedText
      });

      devLog("Document processed successfully:", { docId, chunkCount });
      res.json({ docId, chunkCount });
    } catch (err) {
      console.error("POST /documents error:", err);
      res.status(500).json({
        error: "Failed to process document. Please try again."
      });
    }
  }
);

app.get("/documents/:docId/chunks/:i", async (req, res) => {
  try {
    const { docId } = req.params;
    const index = parseInt(req.params.i, 10);
    if (Number.isNaN(index) || index < 0) {
      return res.status(400).json({ error: "Invalid chunk index." });
    }

    devLog("Fetching chunk:", { docId, index });

    pruneEphemeralDocs();
    const doc = ephemeralDocs.get(docId);
    if (!doc) {
      return res.status(404).json({
        error:
          "Document not found (it may have expired). Please re-import the document."
      });
    }

    const chunk = doc.chunks?.[index];
    if (!chunk) {
      return res.status(404).json({ error: "Chunk not found." });
    }

    let easyread = chunk.easyread;
    if (!easyread) {
      devLog("Generating EasyRead for chunk:", index);
      if (!chunk.originalText || chunk.originalText.trim().length === 0) {
        return res.status(500).json({
          error: "Chunk text is empty. Please reprocess the document."
        });
      }

      const language = doc.language || "auto";
      const baseDelay = 500;
      await new Promise((resolve) => setTimeout(resolve, baseDelay));
      easyread = await generateEasyRead(chunk.originalText, language);
      if (!easyread || !easyread.title || !easyread.sentences) {
        throw new Error("Invalid EasyRead response structure");
      }

      // Cache in memory for this session only (not persisted).
      chunk.easyread = easyread;
    }

    // Precomputation disabled to prevent rate limits
    // Chunks will be generated on-demand when accessed
    // const nextIndex = index + 1;
    // setTimeout(() => {
    //   precomputeNextChunk(docId, nextIndex);
    // }, 0);

    res.json({
      docId,
      chunkIndex: index,
      heading: chunk.heading,
      originalText: chunk.originalText,
      easyread,
      state: {
        unlocked: true, // All chunks are unlocked
        completed: false
      }
    });
  } catch (err) {
    console.error("GET /documents/:docId/chunks/:i error:", err);
    res.status(500).json({
      error: "Failed to load chunk. Please try again.",
    });
  }
});

// Quiz endpoint removed - quiz functionality disabled

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`[EasyRead] listening on ${PORT}${isProduction ? " (production)" : ""}`);
});

