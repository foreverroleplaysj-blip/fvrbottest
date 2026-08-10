// api/database.js
//
// Uses @libsql/client, which speaks the same SQL dialect as SQLite but can
// connect to either:
//   1. Turso (a free, hosted SQLite-compatible database) — set
//      TURSO_DATABASE_URL + TURSO_AUTH_TOKEN. Data survives redeploys on
//      hosts like Render without needing a paid Persistent Disk, because
//      the database lives on Turso's servers, not on Render's filesystem.
//   2. A local file — used automatically when TURSO_DATABASE_URL is not
//      set, for local development. Same code, same queries, either way.

const { createClient } = require('@libsql/client');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const url = process.env.TURSO_DATABASE_URL || `file:${process.env.DATABASE_PATH || './data/foreverrp.sqlite'}`;
const authToken = process.env.TURSO_AUTH_TOKEN; // not used/needed in local file mode

// In local file mode, make sure the containing directory exists —
// libSQL (unlike better-sqlite3) does not create it automatically.
if (url.startsWith('file:')) {
  const filePath = url.slice('file:'.length);
  const dir = path.dirname(filePath);
  if (dir && dir !== '.' && !fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

const db = createClient(authToken ? { url, authToken } : { url });

const SCHEMA = `
CREATE TABLE IF NOT EXISTS accounts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id TEXT UNIQUE NOT NULL,
  roblox_id TEXT,
  roblox_username TEXT,
  verification_code TEXT,
  verification_expires INTEGER,
  verified INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT NOT NULL,
  roblox_id TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  executed_at INTEGER,
  result TEXT
);

CREATE TABLE IF NOT EXISTS bans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  roblox_id TEXT NOT NULL,
  reason TEXT,
  banned_by TEXT,
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  discord_id TEXT,
  roblox_id TEXT,
  details TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS servers (
  job_id TEXT PRIMARY KEY,
  players INTEGER NOT NULL DEFAULT 0,
  max_players INTEGER NOT NULL DEFAULT 0,
  last_heartbeat INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_accounts_roblox_id ON accounts(roblox_id);
CREATE INDEX IF NOT EXISTS idx_commands_roblox_id_status ON commands(roblox_id, status);
CREATE INDEX IF NOT EXISTS idx_bans_roblox_id_active ON bans(roblox_id, active);
`;

async function initDb() {
  await db.executeMultiple(SCHEMA);
}

module.exports = { db, initDb };
