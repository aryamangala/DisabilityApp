import "dotenv/config";
import express from "express";
import cors from "cors";
import multer from "multer";
import pdfParse from "pdf-parse";
import crypto from "crypto";
import path from "path";
import { fileURLToPath } from "url";
import rateLimit from "express-rate-limit";

import { db, initDb, dbGet, dbAll, dbRun } from "./db.mjs";
import {
  removeHeadersFooters,
  normalizeLines,
  chunkText,
  deriveHeading
} from "./textUtils.mjs";
import {
  ocrImageToText,
  generateEasyRead,
  isContentHighlySensitive
} from "./openaiClient.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "10mb" }));

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB - reduced to prevent memory issues
  }
});

// More lenient rate limiting for development/testing
// Increase limits significantly to avoid blocking during testing
const limiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute window
  max: 500, // Allow 500 requests per minute (very lenient for development)
  standardHeaders: true,
  legacyHeaders: false,
  message: JSON.stringify({ error: "Too many requests. Please wait a moment and try again." }),
  skip: (req) => {
    // Skip rate limiting in development or for localhost
    const isLocalhost = req.ip === "127.0.0.1" || 
                       req.ip === "::1" || 
                       req.ip.startsWith("::ffff:127.0.0.1") ||
                       req.hostname === "localhost" ||
                       req.hostname === "127.0.0.1";
    const isDevelopment = process.env.NODE_ENV !== "production";
    return isDevelopment || isLocalhost;
  }
});
app.use(limiter);

initDb();

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

async function storeDocumentAndChunks({ title, language, text }) {
  const docId = generateDocId();
  const createdAt = new Date().toISOString();

  // Optimize: clean and chunk in one pass where possible
  const { chunks } = cleanAndChunk(text);

  // Use transaction for faster bulk insert
  await dbRun("BEGIN TRANSACTION");
  
  try {
    await dbRun(
      `INSERT INTO documents (docId, title, language, createdAt)
       VALUES (?, ?, ?, ?)`,
      [docId, title || null, language || "auto", createdAt]
    );

    // Batch insert chunks for better performance
    const stmt = db.prepare(
      `INSERT INTO chunks
       (docId, chunkIndex, heading, originalText, unlocked, completed)
       VALUES (?, ?, ?, ?, ?, ?)`
    );

    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      const heading = deriveHeading(chunk);
      const unlocked = 1; // All chunks unlocked - no quiz requirement
      stmt.run(docId, index, heading, chunk, unlocked, 0);
    }

    stmt.finalize();
    await dbRun("COMMIT");

    // Generate EasyRead for all chunks in the background
    // This ensures all documents in Previous Files have EasyRead translations
    generateAllEasyReadTranslations(docId, chunks.length, language || "auto").catch(err => {
      console.error(`Background EasyRead generation failed for ${docId}:`, err);
      // Don't throw - document is already stored, EasyRead can be generated on-demand
    });

    return { docId, chunkCount: chunks.length };
  } catch (err) {
    await dbRun("ROLLBACK");
    throw err;
  }
}

// Generate EasyRead translations for all chunks of a document
// Runs in background to avoid blocking the response
async function generateAllEasyReadTranslations(docId, chunkCount, language) {
  console.log(`Starting background EasyRead generation for document ${docId} (${chunkCount} chunks)`);
  
  for (let index = 0; index < chunkCount; index++) {
    try {
      // Check if EasyRead already exists
      const existing = await dbGet(
        `SELECT easyreadJson FROM chunks WHERE docId = ? AND chunkIndex = ?`,
        [docId, index]
      );
      
      if (existing && existing.easyreadJson) {
        console.log(`Chunk ${index} already has EasyRead, skipping`);
        continue;
      }

      // Get chunk text
      const chunkRow = await dbGet(
        `SELECT originalText FROM chunks WHERE docId = ? AND chunkIndex = ?`,
        [docId, index]
      );

      if (!chunkRow || !chunkRow.originalText) {
        console.warn(`Chunk ${index} has no text, skipping`);
        continue;
      }

      console.log(`Generating EasyRead for chunk ${index + 1}/${chunkCount}`);
      
      // Generate EasyRead with rate limiting
      const easyread = await generateEasyRead(chunkRow.originalText, language);
      
      if (!easyread || !easyread.title || !easyread.sentences) {
        console.error(`Invalid EasyRead response for chunk ${index}`);
        continue;
      }

      // Save to database
      await dbRun(
        `UPDATE chunks SET easyreadJson = ? WHERE docId = ? AND chunkIndex = ?`,
        [JSON.stringify(easyread), docId, index]
      );
      
      console.log(`✓ Saved EasyRead for chunk ${index + 1}/${chunkCount}`);
      
      // Add delay between chunks to respect rate limits
      // The RequestQueue in openaiClient already handles delays, but add extra safety
      if (index < chunkCount - 1) {
        await new Promise(resolve => setTimeout(resolve, 800));
      }
    } catch (err) {
      console.error(`Failed to generate EasyRead for chunk ${index}:`, err.message);
      // Continue with next chunk even if one fails
    }
  }
  
  console.log(`Completed EasyRead generation for document ${docId}`);
}

function mimeFromFilename(name) {
  const lower = (name || "").toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".pdf")) return "application/pdf";
  return "application/octet-stream";
}

async function precomputeNextChunk(docId, nextIndex) {
  // Disable aggressive precomputation to avoid rate limits
  // Chunks will be generated on-demand when accessed
  // Uncomment below to re-enable with delay:
  /*
  try {
    // Add delay to avoid hitting rate limits
    await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay
    
    const row = await dbGet(
      `SELECT originalText, easyreadJson, quizJson
       FROM chunks
       WHERE docId = ? AND chunkIndex = ?`,
      [docId, nextIndex]
    );
    if (!row || row.easyreadJson) return;

    const doc = await dbGet(
      `SELECT language FROM documents WHERE docId = ?`,
      [docId]
    );
    const language = doc?.language || "auto";

    const easyread = await generateEasyRead(row.originalText, language);

    await dbRun(
      `UPDATE chunks
       SET easyreadJson = ?
       WHERE docId = ? AND chunkIndex = ?`,
      [JSON.stringify(easyread), docId, nextIndex]
    );
  } catch (err) {
    console.error("Precompute next chunk failed:", err.message);
  }
  */
  return; // Precomputation disabled to prevent rate limits
}

app.get("/health", (req, res) => {
  res.json({ ok: true });
});

// Get all documents
app.get("/documents", async (req, res) => {
  try {
    const docs = await dbAll(
      `SELECT docId, title, language, createdAt
       FROM documents
       ORDER BY createdAt DESC`
    );
    res.json({ documents: docs });
  } catch (err) {
    console.error("GET /documents error:", err);
    res.status(500).json({ error: "Failed to fetch documents." });
  }
});

// Delete all documents
app.delete("/documents", async (req, res) => {
  try {
    console.log("Deleting all documents and chunks...");
    
    // Delete all chunks first (foreign key constraint)
    await dbRun("DELETE FROM chunks");
    console.log("All chunks deleted");
    
    // Delete all documents
    await dbRun("DELETE FROM documents");
    console.log("All documents deleted");
    
    res.json({ success: true, message: "All documents deleted successfully." });
  } catch (err) {
    console.error("DELETE /documents error:", err);
    res.status(500).json({ error: "Failed to delete documents." });
  }
});

// Delete a single document
app.delete("/documents/:docId", async (req, res) => {
  try {
    const { docId } = req.params;
    console.log("Deleting document:", docId);
    
    // Delete all chunks for this document first
    await dbRun("DELETE FROM chunks WHERE docId = ?", [docId]);
    console.log(`All chunks deleted for document ${docId}`);
    
    // Delete the document
    await dbRun("DELETE FROM documents WHERE docId = ?", [docId]);
    console.log(`Document ${docId} deleted`);
    
    res.json({ success: true, message: "Document deleted successfully." });
  } catch (err) {
    console.error("DELETE /documents/:docId error:", err);
    res.status(500).json({ error: "Failed to delete document." });
  }
});

// Get document details with all chunks
app.get("/documents/:docId", async (req, res) => {
  try {
    const { docId } = req.params;
    
    console.log("Fetching document details for:", docId);
    
    const doc = await dbGet(
      `SELECT docId, title, language, createdAt
       FROM documents
       WHERE docId = ?`,
      [docId]
    );
    
    if (!doc) {
      console.error("Document not found:", docId);
      return res.status(404).json({ error: "Document not found." });
    }
    
    const chunks = await dbAll(
      `SELECT chunkIndex, heading, originalText, easyreadJson, 
              unlocked, completed
       FROM chunks
       WHERE docId = ?
       ORDER BY chunkIndex`,
      [docId]
    );
    
    console.log(`Found ${chunks.length} chunks for document ${docId}`);
    
    // Parse JSON fields and return full EasyRead data
    const chunksWithData = chunks.map(chunk => {
      let easyread = null;
      let summary = "";
      
      if (chunk.easyreadJson) {
        try {
          easyread = JSON.parse(chunk.easyreadJson);
          // Create summary from EasyRead sentences (first 3 sentences) for preview
          if (easyread.sentences && Array.isArray(easyread.sentences)) {
            summary = easyread.sentences.slice(0, 3).join(" ") || "";
          }
        } catch (e) {
          console.error("Failed to parse easyreadJson for chunk", chunk.chunkIndex, ":", e);
        }
      }
      
      // Fallback to original text preview if no EasyRead summary
      if (!summary && chunk.originalText) {
        summary = chunk.originalText.substring(0, 150);
        if (chunk.originalText.length > 150) {
          summary += "...";
        }
      }
      
      return {
        chunkIndex: chunk.chunkIndex,
        heading: chunk.heading || `Chunk ${chunk.chunkIndex + 1}`,
        summary: summary || "No summary available",
        easyread: easyread, // Include full EasyRead object
        completed: !!chunk.completed,
        unlocked: true // All chunks unlocked
      };
    });
    
    res.json({
      ...doc,
      chunks: chunksWithData,
      chunkCount: chunks.length
    });
  } catch (err) {
    console.error("GET /documents/:docId error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({ error: `Failed to fetch document: ${err.message}` });
  }
});

// Diagnostic endpoint to test OpenAI connection
app.get("/test-openai", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not set" });
    }
    
    const testResult = await generateEasyRead("This is a test sentence.", "en");
    res.json({ success: true, result: testResult });
  } catch (err) {
    console.error("OpenAI test failed:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

// Diagnostic endpoint to test OpenAI connection
app.get("/test-openai", async (req, res) => {
  try {
    if (!process.env.OPENAI_API_KEY) {
      return res.status(500).json({ error: "OPENAI_API_KEY not set" });
    }
    
    const testResult = await generateEasyRead("This is a test sentence.", "en");
    res.json({ success: true, result: testResult });
  } catch (err) {
    console.error("OpenAI test failed:", err);
    res.status(500).json({ error: err.message, stack: err.stack });
  }
});

app.post(
  "/documents",
  upload.single("file"),
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

        const { docId, chunkCount } = await storeDocumentAndChunks({
          title: title || "Untitled",
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

      const { file } = req;
      const { title, language = "auto", inputType } = req.body || {};

      console.log("File upload received:", {
        hasFile: !!file,
        fileName: file?.originalname,
        fileSize: file?.size,
        inputType,
        contentType: file?.mimetype
      });

      if (!file) {
        console.error("No file received in request");
        return res.status(400).json({ error: "Missing file field." });
      }

      if (inputType !== "pdf" && inputType !== "image") {
        return res
          .status(400)
          .json({ error: "inputType must be 'pdf' or 'image'." });
      }

      console.log("Starting text extraction for:", inputType);
      let extractedText = "";

      if (inputType === "pdf") {
        console.log("Parsing PDF, size:", file.buffer.length, "bytes");
        const pdfData = await pdfParse(file.buffer);
        extractedText = (pdfData.text || "").trim();
        console.log("PDF text extracted, length:", extractedText.length);

        if (extractedText.length < 200) {
          return res.status(400).json({
            error:
              "This PDF appears to be scanned or image-based. " +
              "Scanned PDFs are not supported in this version. " +
              "Please upload a text-based PDF or a clear photo of the document."
          });
        }
      } else if (inputType === "image") {
        console.log("Processing image OCR");
        const mimeType = file.mimetype || mimeFromFilename(file.originalname);
        const base64 = file.buffer.toString("base64");
        console.log("Image base64 length:", base64.length);
        extractedText = await ocrImageToText(base64, mimeType);
        console.log("OCR text extracted, length:", extractedText.length);
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

      console.log("Storing document and chunks...");
      const { docId, chunkCount } = await storeDocumentAndChunks({
        title: title || file.originalname || "Untitled",
        language,
        text: extractedText
      });

      console.log("Document processed successfully:", { docId, chunkCount });
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

    console.log("Fetching chunk:", { docId, index });

    const chunkRow = await dbGet(
      `SELECT chunkIndex, heading, originalText, easyreadJson, unlocked, completed
       FROM chunks
       WHERE docId = ? AND chunkIndex = ?`,
      [docId, index]
    );

    if (!chunkRow) {
      console.error("Chunk not found:", { docId, index });
      return res.status(404).json({ error: "Chunk not found." });
    }

    // All chunks are accessible - no unlocking required
    let easyread = null;

    try {
      easyread = chunkRow.easyreadJson
        ? JSON.parse(chunkRow.easyreadJson)
        : null;
    } catch (parseErr) {
      console.error("Failed to parse cached JSON:", parseErr);
      // If cached JSON is invalid, regenerate
      easyread = null;
    }

    if (!easyread) {
      console.log("Generating EasyRead for chunk:", index);
      
      // Validate chunk text exists
      if (!chunkRow.originalText || chunkRow.originalText.trim().length === 0) {
        console.error("Chunk has no text:", { docId, index });
        return res.status(500).json({
          error: "Chunk text is empty. Please reprocess the document."
        });
      }

      const doc = await dbGet(
        `SELECT language FROM documents WHERE docId = ?`,
        [docId]
      );
      const language = doc?.language || "auto";

      try {
        // Rate limiting: Add delay before API calls to stay within limits
        // OpenAI limits: 500 RPM, 200K TPM
        // We add progressive delays to avoid bursts
        const baseDelay = 500; // Base delay in ms
        await new Promise(resolve => setTimeout(resolve, baseDelay));
        
        console.log("Calling generateEasyRead for chunk text length:", chunkRow.originalText.length);
        easyread =
          easyread || (await generateEasyRead(chunkRow.originalText, language));
        
        if (!easyread || !easyread.title || !easyread.sentences) {
          throw new Error("Invalid EasyRead response structure");
        }
        console.log("EasyRead generated successfully");

        await dbRun(
          `UPDATE chunks
           SET easyreadJson = ?
           WHERE docId = ? AND chunkIndex = ?`,
          [JSON.stringify(easyread), docId, index]
        );
        console.log("Chunk data saved to database");
      } catch (genErr) {
        console.error("Failed to generate EasyRead:", genErr);
        console.error("Error details:", {
          message: genErr.message,
          stack: genErr.stack,
          name: genErr.name
        });
        throw new Error(`Failed to generate content: ${genErr.message}`);
      }
    }

    // Precomputation disabled to prevent rate limits
    // Chunks will be generated on-demand when accessed
    // const nextIndex = index + 1;
    // setTimeout(() => {
    //   precomputeNextChunk(docId, nextIndex);
    // }, 0);

    res.json({
      docId,
      chunkIndex: chunkRow.chunkIndex,
      heading: chunkRow.heading,
      originalText: chunkRow.originalText,
      easyread,
      state: {
        unlocked: true, // All chunks are unlocked
        completed: false
      }
    });
  } catch (err) {
    console.error("GET /documents/:docId/chunks/:i error:", err);
    console.error("Error stack:", err.stack);
    res.status(500).json({
      error: `Failed to load chunk: ${err.message || "Unknown error"}. Please try again.`
    });
  }
});

// Quiz endpoint removed - quiz functionality disabled

app.use((err, req, res, next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, () => {
  console.log(`EasyRead backend listening on port ${PORT}`);
});

