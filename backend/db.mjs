import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.DB_SSL === "true" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function initDb() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      user_id TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS documents (
      id SERIAL PRIMARY KEY,
      doc_id TEXT UNIQUE NOT NULL,
      user_id TEXT NOT NULL,
      title TEXT,
      language TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS chunks (
      id SERIAL PRIMARY KEY,
      doc_id TEXT NOT NULL REFERENCES documents(doc_id) ON DELETE CASCADE,
      chunk_index INTEGER NOT NULL,
      heading TEXT,
      original_text TEXT NOT NULL,
      easyread_json JSONB,
      UNIQUE (doc_id, chunk_index)
    )
  `);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_chunks_doc_id ON chunks (doc_id)
  `);

  // Add password reset columns to existing users table (safe to run repeatedly)
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_token TEXT`);
  await pool.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS reset_expires_at TIMESTAMPTZ`);

  // Add S3 key column to documents table (safe to run repeatedly)
  await pool.query(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS s3_key TEXT`);

  await pool.query(`
    CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents (user_id)
  `);
}

export async function dbGet(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows[0] ?? null;
}

export async function dbAll(sql, params = []) {
  const result = await pool.query(sql, params);
  return result.rows;
}

export async function dbRun(sql, params = []) {
  const result = await pool.query(sql, params);
  return result;
}
