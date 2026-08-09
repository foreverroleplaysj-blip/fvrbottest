// api/routes/roblox.js
// Endpoints called exclusively by the Roblox game server (ForeverIntegration.server.lua).

const express = require('express');
const db = require('../database');
const { isRobloxId, isJobId } = require('../utils/validate');

const router = express.Router();

function logAudit(action, discordId, robloxId, details) {
  db.prepare(
    `INSERT INTO audit_logs (action, discord_id, roblox_id, details, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(action, discordId || null, robloxId || null, details || null, Date.now());
}

// POST /roblox/poll  { robloxIds: ["123", "456"], jobId }
// Roblox sends the list of currently online player UserIds (plus "all" for broadcast
// commands like announce). The API returns pending commands for those players and
// atomically marks them as "processing" so they are never delivered twice.
router.post('/poll', (req, res) => {
  const { robloxIds, jobId } = req.body || {};

  if (!Array.isArray(robloxIds) || robloxIds.length === 0 || robloxIds.length > 200) {
    return res.status(400).json({ error: 'robloxIds must be a non-empty array (max 200)' });
  }
  if (!robloxIds.every((id) => isRobloxId(id))) {
    return res.status(400).json({ error: 'robloxIds contains invalid Roblox UserIds' });
  }
  if (jobId !== undefined && !isJobId(jobId)) {
    return res.status(400).json({ error: 'Invalid jobId' });
  }

  const now = Date.now();

  // Expire stale pending commands first.
  db.prepare(`UPDATE commands SET status = 'expired' WHERE status = 'pending' AND expires_at < ?`).run(now);

  const targets = [...new Set([...robloxIds.map(String), 'all'])];
  const placeholders = targets.map(() => '?').join(',');

  const pending = db
    .prepare(
      `SELECT * FROM commands WHERE status = 'pending' AND roblox_id IN (${placeholders}) ORDER BY created_at ASC`
    )
    .all(...targets);

  const claimed = [];
  const claimStmt = db.prepare(`UPDATE commands SET status = 'processing' WHERE id = ? AND status = 'pending'`);

  const transaction = db.transaction((rows) => {
    for (const row of rows) {
      const result = claimStmt.run(row.id);
      if (result.changes === 1) {
        claimed.push({
          id: row.id,
          type: row.type,
          robloxId: row.roblox_id,
          payload: JSON.parse(row.payload),
        });
      }
    }
  });
  transaction(pending);

  res.json({ commands: claimed });
});

// POST /roblox/complete  { commandId, success, result }
router.post('/complete', (req, res) => {
  const { commandId, success, result } = req.body || {};
  const id = parseInt(commandId, 10);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid commandId' });
  }
  if (typeof success !== 'boolean') {
    return res.status(400).json({ error: 'success must be a boolean' });
  }

  const command = db.prepare('SELECT * FROM commands WHERE id = ?').get(id);
  if (!command) {
    return res.status(404).json({ error: 'Command not found' });
  }
  if (command.status !== 'processing') {
    return res.status(409).json({ error: `Command is not in "processing" state (current: ${command.status})` });
  }

  const resultText = typeof result === 'string' ? result.slice(0, 1000) : null;
  const now = Date.now();

  db.prepare(
    `UPDATE commands SET status = ?, executed_at = ?, result = ? WHERE id = ?`
  ).run(success ? 'completed' : 'failed', now, resultText, id);

  logAudit(
    success ? 'COMMAND_COMPLETED' : 'COMMAND_FAILED',
    command.created_by,
    command.roblox_id,
    `#${id} (${command.type}): ${resultText || ''}`
  );

  // Handle ban/unban side effects in the bans table.
  if (command.type === 'ban' && success) {
    const payload = JSON.parse(command.payload);
    db.prepare(
      `INSERT INTO bans (roblox_id, reason, banned_by, active, created_at) VALUES (?, ?, ?, 1, ?)`
    ).run(command.roblox_id, payload.reason || null, command.created_by, now);
  }
  if (command.type === 'unban' && success) {
    db.prepare(`UPDATE bans SET active = 0 WHERE roblox_id = ? AND active = 1`).run(command.roblox_id);
  }

  res.json({ success: true });
});

// POST /roblox/heartbeat  { jobId, players, maxPlayers }
router.post('/heartbeat', (req, res) => {
  const { jobId, players, maxPlayers } = req.body || {};

  if (!isJobId(jobId)) {
    return res.status(400).json({ error: 'Invalid jobId' });
  }
  if (!Number.isInteger(players) || players < 0 || players > 1000) {
    return res.status(400).json({ error: 'Invalid players count' });
  }
  if (!Number.isInteger(maxPlayers) || maxPlayers < 0 || maxPlayers > 1000) {
    return res.status(400).json({ error: 'Invalid maxPlayers count' });
  }

  const now = Date.now();

  db.prepare(
    `INSERT INTO servers (job_id, players, max_players, last_heartbeat)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(job_id) DO UPDATE SET players = excluded.players, max_players = excluded.max_players, last_heartbeat = excluded.last_heartbeat`
  ).run(jobId, players, maxPlayers, now);

  res.json({ success: true });
});

module.exports = router;
