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

-- ---- Discord guilds the bot is in ----
-- Kept in sync by the bot itself (on ready + guildCreate/guildDelete) via
-- authenticated API calls. The dashboard's "kies een server" screen cross-
-- references this against the guilds the logged-in Discord user can
-- manage, so it only ever shows servers that are BOTH bot-joined AND
-- theirs to configure.
CREATE TABLE IF NOT EXISTS discord_guilds (
  guild_id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  icon TEXT,
  updated_at INTEGER NOT NULL
);

-- ---- Ticket panel system ----
-- One config row per Discord server (guild). Everything about how the
-- panel looks and behaves is stored here so it can be fully configured
-- via slash commands, without touching code or redeploying.
CREATE TABLE IF NOT EXISTS ticket_config (
  guild_id TEXT PRIMARY KEY,
  panel_title TEXT NOT NULL DEFAULT 'Support Tickets',
  panel_description TEXT NOT NULL DEFAULT 'Klik hieronder op het onderwerp dat het beste past om een ticket te openen.',
  panel_color TEXT NOT NULL DEFAULT '1e3a8a',
  panel_image TEXT,
  panel_thumbnail TEXT,
  panel_footer TEXT,
  category_id TEXT,
  log_channel_id TEXT,
  transcript_channel_id TEXT,
  support_role_id TEXT,
  name_format TEXT NOT NULL DEFAULT 'ticket-{number}',
  welcome_message TEXT NOT NULL DEFAULT 'Bedankt voor je ticket, {user}! Beschrijf je vraag of probleem zo duidelijk mogelijk — het team helpt je zo snel mogelijk.',
  max_open_per_user INTEGER NOT NULL DEFAULT 1,
  require_close_reason INTEGER NOT NULL DEFAULT 0,
  ping_support_role INTEGER NOT NULL DEFAULT 1,
  show_ticket_info INTEGER NOT NULL DEFAULT 1,
  ticket_counter INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

-- The individual buttons/options a user can pick from the panel's select
-- menu. Each type can override the category/role/naming/welcome message
-- from ticket_config, so different ticket types can behave differently.
CREATE TABLE IF NOT EXISTS ticket_types (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  key TEXT NOT NULL,
  label TEXT NOT NULL,
  emoji TEXT,
  description TEXT,
  category_id TEXT,
  support_role_id TEXT,
  name_format TEXT,
  welcome_message TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  claim_enabled INTEGER NOT NULL DEFAULT 1,
  close_enabled INTEGER NOT NULL DEFAULT 1,
  ask_description INTEGER NOT NULL DEFAULT 1,
  max_open_override INTEGER,
  created_at INTEGER NOT NULL,
  UNIQUE(guild_id, key)
);

CREATE TABLE IF NOT EXISTS tickets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT UNIQUE NOT NULL,
  opener_id TEXT NOT NULL,
  type_key TEXT,
  type_label TEXT,
  ticket_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'open',
  claimed_by TEXT,
  close_reason TEXT,
  closed_by TEXT,
  created_at INTEGER NOT NULL,
  closed_at INTEGER
);

-- ---- Giveaways ----
-- Button-based giveaway (GiveawayBot-style 🎉 "Enter" button). Entries are
-- stored right here as a JSON array of Discord user IDs, toggled via
-- POST /giveaways/enter whenever someone clicks the button — that's what
-- powers the live "Entries: N" counter on the embed.
CREATE TABLE IF NOT EXISTS giveaways (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  guild_id TEXT NOT NULL,
  channel_id TEXT NOT NULL,
  message_id TEXT UNIQUE NOT NULL,
  prize TEXT NOT NULL,
  description TEXT,
  winner_count INTEGER NOT NULL DEFAULT 1,
  host_id TEXT NOT NULL,
  required_role_id TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | ended | cancelled
  entries TEXT NOT NULL DEFAULT '[]', -- JSON array of Discord user IDs who entered
  winners TEXT, -- JSON array of Discord user IDs, set once ended
  ends_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  ended_at INTEGER
);

CREATE INDEX IF NOT EXISTS idx_accounts_roblox_id ON accounts(roblox_id);
CREATE INDEX IF NOT EXISTS idx_commands_roblox_id_status ON commands(roblox_id, status);
CREATE INDEX IF NOT EXISTS idx_bans_roblox_id_active ON bans(roblox_id, active);
CREATE INDEX IF NOT EXISTS idx_ticket_types_guild ON ticket_types(guild_id, position);
CREATE INDEX IF NOT EXISTS idx_tickets_guild_status ON tickets(guild_id, status);
CREATE INDEX IF NOT EXISTS idx_tickets_opener_status ON tickets(opener_id, status);
CREATE INDEX IF NOT EXISTS idx_giveaways_status ON giveaways(status, ends_at);
CREATE INDEX IF NOT EXISTS idx_giveaways_guild ON giveaways(guild_id, status);
`;

// Columns added after the initial release. CREATE TABLE IF NOT EXISTS does
// not retrofit existing tables, so on every boot we make sure these exist
// too — each ALTER is wrapped so an "already exists" error (fresh installs
// that already have the column via SCHEMA above) is silently ignored.
const MIGRATIONS = [
  `ALTER TABLE ticket_types ADD COLUMN claim_enabled INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE ticket_types ADD COLUMN close_enabled INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE ticket_types ADD COLUMN ask_description INTEGER NOT NULL DEFAULT 1`,
  `ALTER TABLE ticket_types ADD COLUMN max_open_override INTEGER`,
  `ALTER TABLE ticket_config ADD COLUMN show_ticket_info INTEGER NOT NULL DEFAULT 1`,
  // The `tickets` table pre-dates the full ticket-panel system on some
  // existing databases (e.g. earlier deploys) — CREATE TABLE IF NOT EXISTS
  // above does nothing for those, so retrofit every column it now needs.
  `ALTER TABLE tickets ADD COLUMN type_key TEXT`,
  `ALTER TABLE tickets ADD COLUMN type_label TEXT`,
  `ALTER TABLE tickets ADD COLUMN ticket_number INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tickets ADD COLUMN claimed_by TEXT`,
  `ALTER TABLE tickets ADD COLUMN close_reason TEXT`,
  `ALTER TABLE tickets ADD COLUMN closed_by TEXT`,
  `ALTER TABLE tickets ADD COLUMN closed_at INTEGER`,
  // Giveaways: retrofit for databases created before the button/description/
  // entries system existed.
  `ALTER TABLE giveaways ADD COLUMN description TEXT`,
  `ALTER TABLE giveaways ADD COLUMN entries TEXT NOT NULL DEFAULT '[]'`,
];

async function initDb() {
  await db.executeMultiple(SCHEMA);

  for (const sql of MIGRATIONS) {
    try {
      await db.execute({ sql, args: [] });
    } catch (err) {
      if (!/duplicate column/i.test(err.message)) throw err;
    }
  }
}

module.exports = { db, initDb };
