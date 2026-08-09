// api/database.js
// SQLite database setup using better-sqlite3.
// Synchronous API — simple, fast, and safe for this workload.

const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
require('dotenv').config();

const dbPath = process.env.DATABASE_PATH || './data/foreverrp.sqlite';
const dbDir = path.dirname(dbPath);

if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
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
`);

module.exports = db;
