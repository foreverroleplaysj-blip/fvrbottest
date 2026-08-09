// api/routes/commands.js
// Generic command queue — used by every admin action (give-money, setjob, ban, etc).
// This design is intentionally generic so new command types can be added without
// touching the queue, polling or completion logic — just add the type to the
// whitelist in api/utils/validate.js and handle it in the Roblox script.

const express = require('express');
const db = require('../database');
const {
  isDiscordId,
  isRobloxId,
  isValidCommandType,
  isValidAccount,
  isPositiveInteger,
} = require('../utils/validate');

const router = express.Router();

const COMMAND_TTL_MS = 5 * 60 * 1000; // Commands expire after 5 minutes if not picked up
const MAX_MONEY_AMOUNT = parseInt(process.env.MAX_MONEY_AMOUNT, 10) || 1000000;
const MAX_RANK_LEVEL = parseInt(process.env.MAX_RANK_LEVEL, 10) || 20;
const MAX_GANG_LEVEL = parseInt(process.env.MAX_GANG_LEVEL, 10) || 10;

function logAudit(action, discordId, robloxId, details) {
  db.prepare(
    `INSERT INTO audit_logs (action, discord_id, roblox_id, details, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(action, discordId || null, robloxId || null, details || null, Date.now());
}

/**
 * Validate the payload shape for a given command type.
 * Returns an error string, or null if valid.
 */
function validatePayload(type, payload) {
  switch (type) {
    case 'give_money':
    case 'remove_money':
    case 'set_money':
      if (!isPositiveInteger(payload.amount, MAX_MONEY_AMOUNT)) {
        return `amount must be an integer between 0 and ${MAX_MONEY_AMOUNT}`;
      }
      if (!isValidAccount(payload.account)) {
        return 'account must be "Contant" or "Bank"';
      }
      return null;

    case 'set_job':
      if (typeof payload.job !== 'string' || payload.job.length < 1 || payload.job.length > 64) {
        return 'job must be a non-empty string';
      }
      return null;

    case 'set_rank':
      if (!isPositiveInteger(payload.rank, MAX_RANK_LEVEL)) {
        return `rank must be an integer between 0 and ${MAX_RANK_LEVEL}`;
      }
      return null;

    case 'set_gang':
      if (typeof payload.gang !== 'string' || payload.gang.length < 1 || payload.gang.length > 16) {
        return 'gang must be a non-empty string';
      }
      return null;

    case 'set_gang_level':
      if (!isPositiveInteger(payload.level, MAX_GANG_LEVEL)) {
        return `level must be an integer between 0 and ${MAX_GANG_LEVEL}`;
      }
      return null;

    case 'ban':
      if (typeof payload.reason !== 'string' || payload.reason.length < 1 || payload.reason.length > 500) {
        return 'reason must be a non-empty string (max 500 chars)';
      }
      return null;

    case 'kick':
      if (payload.reason !== undefined && typeof payload.reason !== 'string') {
        return 'reason must be a string';
      }
      return null;

    case 'unban':
      return null; // no payload required

    case 'announce':
      if (typeof payload.message !== 'string' || payload.message.length < 1 || payload.message.length > 500) {
        return 'message must be a non-empty string (max 500 chars)';
      }
      return null;

    default:
      return 'Unsupported command type';
  }
}

// POST /commands/create  { type, robloxId, payload, createdBy }
router.post('/create', (req, res) => {
  const { type, robloxId, payload, createdBy } = req.body || {};

  if (!isValidCommandType(type)) {
    return res.status(400).json({ error: 'Invalid or unsupported command type' });
  }

  // "announce" broadcasts to all servers and does not target a specific player.
  if (type !== 'announce' && !isRobloxId(robloxId)) {
    return res.status(400).json({ error: 'Invalid or missing robloxId' });
  }
  if (type === 'announce' && robloxId !== 'all') {
    return res.status(400).json({ error: 'announce commands must target robloxId "all"' });
  }

  if (createdBy !== undefined && !isDiscordId(createdBy)) {
    return res.status(400).json({ error: 'Invalid createdBy discordId' });
  }

  const safePayload = payload && typeof payload === 'object' ? payload : {};
  const validationError = validatePayload(type, safePayload);
  if (validationError) {
    return res.status(400).json({ error: `Invalid payload: ${validationError}` });
  }

  const now = Date.now();
  const expiresAt = now + COMMAND_TTL_MS;

  const result = db
    .prepare(
      `INSERT INTO commands (type, roblox_id, payload, status, created_by, created_at, expires_at)
       VALUES (?, ?, ?, 'pending', ?, ?, ?)`
    )
    .run(type, String(robloxId), JSON.stringify(safePayload), createdBy || null, now, expiresAt);

  logAudit(type.toUpperCase(), createdBy, robloxId, JSON.stringify(safePayload));

  res.status(201).json({ id: result.lastInsertRowid, status: 'pending', expiresAt });
});

// GET /commands/:id
router.get('/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({ error: 'Invalid command id' });
  }

  const command = db.prepare('SELECT * FROM commands WHERE id = ?').get(id);
  if (!command) {
    return res.status(404).json({ error: 'Command not found' });
  }

  res.json({
    id: command.id,
    type: command.type,
    robloxId: command.roblox_id,
    payload: JSON.parse(command.payload),
    status: command.status,
    createdAt: command.created_at,
    executedAt: command.executed_at,
    result: command.result,
  });
});

// POST /commands/cancel  { id, actorDiscordId }
router.post('/cancel', (req, res) => {
  const { id, actorDiscordId } = req.body || {};
  const commandId = parseInt(id, 10);

  if (!Number.isInteger(commandId) || commandId <= 0) {
    return res.status(400).json({ error: 'Invalid command id' });
  }

  const command = db.prepare('SELECT * FROM commands WHERE id = ?').get(commandId);
  if (!command) {
    return res.status(404).json({ error: 'Command not found' });
  }
  if (command.status !== 'pending') {
    return res.status(409).json({ error: `Cannot cancel command with status "${command.status}"` });
  }

  db.prepare(`UPDATE commands SET status = 'expired' WHERE id = ?`).run(commandId);

  logAudit('CANCEL_COMMAND', actorDiscordId, command.roblox_id, `Command #${commandId} (${command.type}) cancelled`);

  res.json({ success: true });
});

module.exports = router;
