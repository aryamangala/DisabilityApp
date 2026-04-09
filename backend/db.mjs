import sqlite3 from "sqlite3";
import path from "path";
import { fileURLToPath } from "url";

if (process.env.NODE_ENV !== "production") {
  sqlite3.verbose();
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "easyread.db");

export const db = new sqlite3.Database(DB_PATH);

export function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        docId TEXT UNIQUE NOT NULL,
        title TEXT,
        language TEXT,
        createdAt TEXT NOT NULL
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS chunks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        docId TEXT NOT NULL,
        chunkIndex INTEGER NOT NULL,
        heading TEXT,
        originalText TEXT NOT NULL,
        easyreadJson TEXT,
        quizJson TEXT,
        unlocked INTEGER NOT NULL DEFAULT 0,
        completed INTEGER NOT NULL DEFAULT 0,
        quizAttempts INTEGER NOT NULL DEFAULT 0,
        UNIQUE (docId, chunkIndex)
      )
    `);

    db.run(`
      CREATE INDEX IF NOT EXISTS idx_chunks_docId
      ON chunks (docId)
    `);

    // Migration: Add quizAttempts column if it doesn't exist
    db.run(`
      ALTER TABLE chunks
      ADD COLUMN quizAttempts INTEGER NOT NULL DEFAULT 0
    `, (err) => {
      // Ignore error if column already exists
      if (err && !err.message.includes("duplicate column")) {
        console.error("[EasyRead] DB migration:", err.message);
      }
    });
  });
}

export function dbGet(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function dbAll(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export function dbRun(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

