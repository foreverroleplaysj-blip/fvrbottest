// api/routes/verification.js
const express = require('express');
const crypto = require('crypto');
const db = require('../database');
const { isDiscordId, isRobloxId } = require('../utils/validate');

const router = express.Router();

const CODE_TTL_MS = 10 * 60 * 1000; // 10 minutes

function generateCode() {
  // FVR-XXXXXX using cryptographically secure randomness, unambiguous charset.
  const charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I
  const bytes = crypto.randomBytes(6);
  let code = 'FVR-';
  for (let i = 0; i < 6; i++) {
    code += charset[bytes[i] % charset.length];
  }
  return code;
}

function logAudit(action, discordId, robloxId, details) {
  db.prepare(
    `INSERT INTO audit_logs (action, discord_id, roblox_id, details, created_at) VALUES (?, ?, ?, ?, ?)`
  ).run(action, discordId || null, robloxId || null, details || null, Date.now());
}

// POST /verification/create  { discordId }
router.post('/create', (req, res) => {
  const { discordId } = req.body || {};

  if (!isDiscordId(discordId)) {
    return res.status(400).json({ error: 'Invalid or missing discordId' });
  }

  const existing = db.prepare('SELECT * FROM accounts WHERE discord_id = ?').get(discordId);

  if (existing && existing.verified) {
    return res.status(409).json({ error: 'This Discord account is already verified' });
  }

  const code = generateCode();
  const expires = Date.now() + CODE_TTL_MS;
  const now = Date.now();

  if (existing) {
    db.prepare(
      `UPDATE accounts SET verification_code = ?, verification_expires = ?, updated_at = ? WHERE discord_id = ?`
    ).run(code, expires, now, discordId);
  } else {
    db.prepare(
      `INSERT INTO accounts (discord_id, verification_code, verification_expires, verified, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?)`
    ).run(discordId, code, expires, now, now);
  }

  res.json({ code, expiresInMinutes: 10, expiresAt: expires });
});

// POST /verification/complete  { code, robloxId, robloxUsername }
// Called by the Roblox server when a player runs /verify FVR-XXXXXX in-game.
router.post('/complete', (req, res) => {
  const { code, robloxId, robloxUsername } = req.body || {};

  if (typeof code !== 'string' || !/^FVR-[A-Z0-9]{6}$/.test(code)) {
    return res.status(400).json({ error: 'Invalid code format' });
  }
  if (!isRobloxId(robloxId)) {
    return res.status(400).json({ error: 'Invalid or missing robloxId' });
  }
  if (typeof robloxUsername !== 'string' || robloxUsername.length < 3 || robloxUsername.length > 32) {
    return res.status(400).json({ error: 'Invalid robloxUsername' });
  }

  const account = db.prepare('SELECT * FROM accounts WHERE verification_code = ?').get(code);

  if (!account) {
    return res.status(404).json({ error: 'Code not found' });
  }
  if (account.verified) {
    return res.status(409).json({ error: 'Code already used' });
  }
  if (account.verification_expires < Date.now()) {
    return res.status(410).json({ error: 'Code expired' });
  }

  // Prevent one Roblox account from being linked to multiple Discord accounts.
  const robloxAlready = db
    .prepare('SELECT * FROM accounts WHERE roblox_id = ? AND verified = 1')
    .get(String(robloxId));
  if (robloxAlready) {
    return res.status(409).json({ error: 'This Roblox account is already linked to a Discord account' });
  }

  const now = Date.now();
  db.prepare(
    `UPDATE accounts
     SET roblox_id = ?, roblox_username = ?, verified = 1, verification_code = NULL, verification_expires = NULL, updated_at = ?
     WHERE id = ?`
  ).run(String(robloxId), robloxUsername, now, account.id);

  logAudit('VERIFY', account.discord_id, robloxId, `Linked to ${robloxUsername}`);

  res.json({ success: true, discordId: account.discord_id, robloxId: String(robloxId), robloxUsername });
});

// GET /verification/:discordId
router.get('/:discordId', (req, res) => {
  const { discordId } = req.params;

  if (!isDiscordId(discordId)) {
    return res.status(400).json({ error: 'Invalid discordId' });
  }

  const account = db.prepare('SELECT * FROM accounts WHERE discord_id = ?').get(discordId);

  if (!account) {
    return res.json({ verified: false });
  }

  res.json({
    verified: !!account.verified,
    discordId: account.discord_id,
    robloxId: account.roblox_id,
    robloxUsername: account.roblox_username,
    verifiedAt: account.verified ? account.updated_at : null,
  });
});

// POST /verification/unverify  { discordId, actorDiscordId }
router.post('/unverify', (req, res) => {
  const { discordId, actorDiscordId } = req.body || {};

  if (!isDiscordId(discordId)) {
    return res.status(400).json({ error: 'Invalid or missing discordId' });
  }

  const account = db.prepare('SELECT * FROM accounts WHERE discord_id = ? AND verified = 1').get(discordId);

  if (!account) {
    return res.status(404).json({ error: 'No verified account found for this discordId' });
  }

  const now = Date.now();
  db.prepare(
    `UPDATE accounts SET verified = 0, roblox_id = NULL, roblox_username = NULL, updated_at = ? WHERE id = ?`
  ).run(now, account.id);

  logAudit('UNVERIFY', discordId, account.roblox_id, `Unlinked by ${actorDiscordId || 'unknown'}`);

  res.json({ success: true, robloxId: account.roblox_id, robloxUsername: account.roblox_username });
});

module.exports = router;
