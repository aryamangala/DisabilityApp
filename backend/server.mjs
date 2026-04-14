import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

import {
  removeHeadersFooters,
  normalizeLines,
  chunkText,
  deriveHeading
} from "./textUtils.mjs";
import { ocrImageToText, generateEasyRead } from "./openaiClient.mjs";
import { pool, initDb, dbGet, dbAll, dbRun } from "./db.mjs";
import { requireAuth } from "./authMiddleware.mjs";

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
      ? { origin: corsOrigins, allowedHeaders: ["Content-Type", "Authorization"] }
      : {
          origin: (origin, cb) => cb(null, true),
          allowedHeaders: ["Content-Type", "Authorization"],
        }
  )
);
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 25 }
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
    return ip === "127.0.0.1" || ip === "::1" || ip.startsWith("::ffff:127.0.0.1");
  },
});
app.use(limiter);

function generateDocId() {
  return crypto.randomBytes(12).toString("hex");
}

function cleanAndChunk(rawText) {
  if (!rawText || rawText.trim().length < 500) {
    const chunks = chunkText(rawText);
    return { chunks };
  }
  const noHeaders = removeHeadersFooters(rawText);
  const normalized = normalizeLines(noHeaders);
  const chunks = chunkText(normalized);
  return { chunks };
}

function mimeFromFilename(name) {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

// ── Routes ──────────────────────────────────────────────────────────────────

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// ── Auth ─────────────────────────────────────────────────────────────────────

app.post("/auth/register", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || typeof email !== "string" || !email.includes("@")) {
      return res.status(400).json({ error: "Valid email is required." });
    }
    if (!password || typeof password !== "string" || password.length < 8) {
      return res.status(400).json({ error: "Password must be at least 8 characters." });
    }

    const existing = await dbGet(`SELECT user_id FROM users WHERE email = $1`, [email.toLowerCase()]);
    if (existing) {
      return res.status(409).json({ error: "An account with this email already exists." });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const userId = crypto.randomUUID();
    await dbRun(
      `INSERT INTO users (user_id, email, password_hash) VALUES ($1, $2, $3)`,
      [userId, email.toLowerCase(), passwordHash]
    );

    res.json({ ok: true });
  } catch (err) {
    console.error("POST /auth/register error:", err);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

app.post("/auth/login", async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ error: "Email and password are required." });
    }

    const user = await dbGet(
      `SELECT user_id, password_hash FROM users WHERE email = $1`,
      [email.toLowerCase()]
    );
    if (!user) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    const match = await bcrypt.compare(password, user.password_hash);
    if (!match) {
      return res.status(401).json({ error: "Incorrect email or password." });
    }

    const accessToken = jwt.sign(
      { sub: user.user_id, email: email.toLowerCase() },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({ accessToken, email: email.toLowerCase() });
  } catch (err) {
    console.error("POST /auth/login error:", err);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
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

// List all documents belonging to the authenticated user
app.get("/documents", requireAuth, async (req, res) => {
  try {
    const rows = await dbAll(
      `SELECT doc_id AS "docId", title, language, created_at AS "createdAt",
              (SELECT COUNT(*) FROM chunks WHERE chunks.doc_id = documents.doc_id) AS "chunkCount"
       FROM documents
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [req.userId]
    );
    res.json({ documents: rows });
  } catch (err) {
    console.error("GET /documents error:", err);
    res.status(500).json({ error: "Failed to fetch documents." });
  }
});

// Upload / create a new document
app.post(
  "/documents",
  requireAuth,
  (req, res, next) => {
    devLog("[POST /documents] request started", {
      ts: new Date().toISOString(),
      contentType: req.headers["content-type"],
      ip: req.ip,
    });
    next();
  },
  documentUploadWithErrorLogging,
  async (req, res) => {
    try {
      const contentType = req.headers["content-type"] || "";
      let extractedText = "";
      let title = "";
      let language = "auto";

      if (contentType.includes("application/json")) {
        ({ title = "", language = "auto", text: extractedText = "" } = req.body || {});
        if (!extractedText || typeof extractedText !== "string" || !extractedText.trim()) {
          return res.status(400).json({ error: "Missing 'text' in request body." });
        }
      } else if (contentType.includes("multipart/form-data")) {
        const fileField = req.files?.file?.[0];
        const filesField = req.files?.files || [];
        let inputType;
        ({ title = "", language = "auto", inputType } = req.body || {});

        if (inputType !== "pdf" && inputType !== "image") {
          return res.status(400).json({ error: "inputType must be 'pdf' or 'image'." });
        }

        if (inputType === "pdf") {
          if (!fileField) return res.status(400).json({ error: "Missing file field." });
          devLog("Parsing PDF, size:", fileField.buffer.length, "bytes");
          const pdfData = await pdfParse(fileField.buffer);
          extractedText = (pdfData.text || "").trim();
          if (extractedText.length < 200) {
            return res.status(400).json({
              error:
                "This PDF appears to be scanned or image-based. " +
                "Please upload a text-based PDF or a clear photo of the document."
            });
          }
          if (!title) title = fileField.originalname || "";
        } else {
          const imageBuffers = filesField.length > 0 ? filesField : fileField ? [fileField] : [];
          if (imageBuffers.length === 0) {
            return res.status(400).json({ error: "Missing image file(s)." });
          }
          if (imageBuffers.length > 24) {
            return res.status(400).json({ error: "Too many images (maximum 24 pages)." });
          }
          devLog("Processing image OCR, pages:", imageBuffers.length);
          const parts = [];
          for (let i = 0; i < imageBuffers.length; i++) {
            const img = imageBuffers[i];
            const mimeType = img.mimetype || mimeFromFilename(img.originalname);
            if (i > 0) await new Promise((r) => setTimeout(r, 400));
            const pageText = await ocrImageToText(img.buffer.toString("base64"), mimeType);
            parts.push(`\n\n--- Page ${i + 1} ---\n\n${(pageText || "").trim()}`);
          }
          extractedText = parts.join("\n").trim();
        }
      } else {
        return res.status(400).json({
          error: "Unsupported Content-Type. Use application/json or multipart/form-data."
        });
      }

      if (!extractedText || extractedText.trim().length < 20) {
        return res.status(400).json({ error: "Unable to extract enough text from this file." });
      }

      const { chunks } = cleanAndChunk(extractedText);
      const docId = generateDocId();
      const safeTitle = title || extractedText.slice(0, 60).replace(/\n/g, " ").trim();

      // Persist document and all chunks in a single transaction
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await client.query(
          `INSERT INTO documents (doc_id, user_id, title, language) VALUES ($1, $2, $3, $4)`,
          [docId, req.userId, safeTitle, language]
        );
        for (let i = 0; i < chunks.length; i++) {
          await client.query(
            `INSERT INTO chunks (doc_id, chunk_index, heading, original_text)
             VALUES ($1, $2, $3, $4)`,
            [docId, i, deriveHeading(chunks[i]), chunks[i]]
          );
        }
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }

      devLog("Document saved:", { docId, chunkCount: chunks.length });
      res.json({ docId, chunkCount: chunks.length });
    } catch (err) {
      console.error("POST /documents error:", err);
      res.status(500).json({ error: "Failed to process document. Please try again." });
    }
  }
);

// Fetch a specific chunk (generates EasyRead on first access and caches to DB)
app.get("/documents/:docId/chunks/:i", requireAuth, async (req, res) => {
  try {
    const { docId } = req.params;
    const index = parseInt(req.params.i, 10);
    if (Number.isNaN(index) || index < 0) {
      return res.status(400).json({ error: "Invalid chunk index." });
    }

    // Verify document belongs to this user
    const doc = await dbGet(
      `SELECT doc_id, language FROM documents WHERE doc_id = $1 AND user_id = $2`,
      [docId, req.userId]
    );
    if (!doc) {
      return res.status(404).json({ error: "Document not found." });
    }

    const chunk = await dbGet(
      `SELECT heading, original_text AS "originalText", easyread_json AS "easyread"
       FROM chunks WHERE doc_id = $1 AND chunk_index = $2`,
      [docId, index]
    );
    if (!chunk) {
      return res.status(404).json({ error: "Chunk not found." });
    }

    let easyread = chunk.easyread;
    if (!easyread) {
      devLog("Generating EasyRead for chunk:", index);
      await new Promise((resolve) => setTimeout(resolve, 500));
      easyread = await generateEasyRead(chunk.originalText, doc.language || "auto");
      if (!easyread || !easyread.title || !easyread.sentences) {
        throw new Error("Invalid EasyRead response structure");
      }
      // Persist generated EasyRead so it's never re-generated
      await dbRun(
        `UPDATE chunks SET easyread_json = $1 WHERE doc_id = $2 AND chunk_index = $3`,
        [JSON.stringify(easyread), docId, index]
      );
    }

    res.json({
      docId,
      chunkIndex: index,
      heading: chunk.heading,
      originalText: chunk.originalText,
      easyread,
      state: { unlocked: true, completed: false }
    });
  } catch (err) {
    console.error("GET /documents/:docId/chunks/:i error:", err);
    res.status(500).json({ error: "Failed to load chunk. Please try again." });
  }
});

// Delete a document (and its chunks via CASCADE)
app.delete("/documents/:docId", requireAuth, async (req, res) => {
  try {
    const { docId } = req.params;
    const result = await dbRun(
      `DELETE FROM documents WHERE doc_id = $1 AND user_id = $2`,
      [docId, req.userId]
    );
    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Document not found." });
    }
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /documents/:docId error:", err);
    res.status(500).json({ error: "Failed to delete document." });
  }
});

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

// ── Start ────────────────────────────────────────────────────────────────────

initDb()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`[EasyRead] listening on ${PORT}${isProduction ? " (production)" : ""}`);
    });
  })
  .catch((err) => {
    console.error("[EasyRead] Failed to initialize database:", err);
    process.exit(1);
  });
