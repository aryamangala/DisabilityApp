import pg from "pg";

const { Pool } = pg;

export const pool = new Pool({
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || "5432", 10),
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 10,
  idleTimeoutMillis: 30000,
});

export async function initDb() {
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
