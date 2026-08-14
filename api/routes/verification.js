// api/routes/verification.js
const express = require('express');
const crypto = require('crypto');
const { db } = require('../database');
const { isDiscordId, isRobloxId } = require('../utils/validate');
const asyncHandler = require('../utils/asyncHandler');

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

async function logAudit(action, discordId, robloxId, details) {
  await db.execute({
    sql: `INSERT INTO audit_logs (action, discord_id, roblox_id, details, created_at) VALUES (?, ?, ?, ?, ?)`,
    args: [action, discordId || null, robloxId || null, details || null, Date.now()],
  });
}

// POST /verification/create  { discordId }
router.post(
  '/create',
  asyncHandler(async (req, res) => {
    const { discordId } = req.body || {};

    if (!isDiscordId(discordId)) {
      return res.status(400).json({ error: 'Invalid or missing discordId' });
    }

    const existingResult = await db.execute({
      sql: 'SELECT * FROM accounts WHERE discord_id = ?',
      args: [discordId],
    });
    const existing = existingResult.rows[0];

    if (existing && existing.verified) {
      return res.status(409).json({ error: 'This Discord account is already verified' });
    }

    const code = generateCode();
    const expires = Date.now() + CODE_TTL_MS;
    const now = Date.now();

    if (existing) {
      await db.execute({
        sql: `UPDATE accounts SET verification_code = ?, verification_expires = ?, updated_at = ? WHERE discord_id = ?`,
        args: [code, expires, now, discordId],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO accounts (discord_id, verification_code, verification_expires, verified, created_at, updated_at)
              VALUES (?, ?, ?, 0, ?, ?)`,
        args: [discordId, code, expires, now, now],
      });
    }

    res.json({ code, expiresInMinutes: 10, expiresAt: expires });
  })
);

// POST /verification/complete  { code, robloxId, robloxUsername }
// Called by the Roblox server when a player runs /verify FVR-XXXXXX in-game.
router.post(
  '/complete',
  asyncHandler(async (req, res) => {
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

    const accountResult = await db.execute({
      sql: 'SELECT * FROM accounts WHERE verification_code = ?',
      args: [code],
    });
    const account = accountResult.rows[0];

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
    const robloxAlreadyResult = await db.execute({
      sql: 'SELECT * FROM accounts WHERE roblox_id = ? AND verified = 1',
      args: [String(robloxId)],
    });
    if (robloxAlreadyResult.rows[0]) {
      return res.status(409).json({ error: 'This Roblox account is already linked to a Discord account' });
    }

    const now = Date.now();
    await db.execute({
      sql: `UPDATE accounts
            SET roblox_id = ?, roblox_username = ?, verified = 1, verification_code = NULL, verification_expires = NULL, updated_at = ?
            WHERE id = ?`,
      args: [String(robloxId), robloxUsername, now, account.id],
    });

    await logAudit('VERIFY', account.discord_id, robloxId, `Linked to ${robloxUsername}`);

    res.json({ success: true, discordId: account.discord_id, robloxId: String(robloxId), robloxUsername });
  })
);

// POST /verification/link-direct  { discordId, robloxId, robloxUsername }
// Used by the Discord button + modal flow: the Discord side has already
// authenticated the user via the interaction, and the bot has already
// confirmed the Roblox username exists via the Roblox API — so this skips
// the FVR-XXXXXX code exchange entirely. Same uniqueness guarantees as
// /complete: one Discord account <-> one Roblox account.
router.post(
  '/link-direct',
  asyncHandler(async (req, res) => {
    const { discordId, robloxId, robloxUsername } = req.body || {};

    if (!isDiscordId(discordId)) {
      return res.status(400).json({ error: 'Invalid or missing discordId' });
    }
    if (!isRobloxId(robloxId)) {
      return res.status(400).json({ error: 'Invalid or missing robloxId' });
    }
    if (typeof robloxUsername !== 'string' || robloxUsername.length < 3 || robloxUsername.length > 32) {
      return res.status(400).json({ error: 'Invalid robloxUsername' });
    }

    const existingResult = await db.execute({
      sql: 'SELECT * FROM accounts WHERE discord_id = ?',
      args: [discordId],
    });
    const existing = existingResult.rows[0];

    if (existing && existing.verified) {
      return res.status(409).json({ error: 'This Discord account is already verified' });
    }

    const robloxAlreadyResult = await db.execute({
      sql: 'SELECT * FROM accounts WHERE roblox_id = ? AND verified = 1',
      args: [String(robloxId)],
    });
    if (robloxAlreadyResult.rows[0]) {
      return res.status(409).json({ error: 'This Roblox account is already linked to a Discord account' });
    }

    const now = Date.now();

    if (existing) {
      await db.execute({
        sql: `UPDATE accounts
              SET roblox_id = ?, roblox_username = ?, verified = 1,
                  verification_code = NULL, verification_expires = NULL, updated_at = ?
              WHERE discord_id = ?`,
        args: [String(robloxId), robloxUsername, now, discordId],
      });
    } else {
      await db.execute({
        sql: `INSERT INTO accounts (discord_id, roblox_id, roblox_username, verified, created_at, updated_at)
              VALUES (?, ?, ?, 1, ?, ?)`,
        args: [discordId, String(robloxId), robloxUsername, now, now],
      });
    }

    await logAudit('VERIFY_DIRECT', discordId, robloxId, `Linked to ${robloxUsername} via button/modal`);

    res.json({ success: true, discordId, robloxId: String(robloxId), robloxUsername });
  })
);

// GET /verification/list
// Returns every verified account. Used by /checkverify in Discord.
router.get(
  '/list',
  asyncHandler(async (req, res) => {
    const result = await db.execute(
      `SELECT discord_id, roblox_id, roblox_username, updated_at
       FROM accounts WHERE verified = 1 ORDER BY updated_at DESC`
    );

    res.json({
      total: result.rows.length,
      accounts: result.rows.map((a) => ({
        discordId: a.discord_id,
        robloxId: a.roblox_id,
        robloxUsername: a.roblox_username,
        verifiedAt: a.updated_at,
      })),
    });
  })
);

// GET /verification/:discordId
router.get(
  '/:discordId',
  asyncHandler(async (req, res) => {
    const { discordId } = req.params;

    if (!isDiscordId(discordId)) {
      return res.status(400).json({ error: 'Invalid discordId' });
    }

    const result = await db.execute({
      sql: 'SELECT * FROM accounts WHERE discord_id = ?',
      args: [discordId],
    });
    const account = result.rows[0];

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
  })
);

// POST /verification/unverify  { discordId, actorDiscordId }
router.post(
  '/unverify',
  asyncHandler(async (req, res) => {
    const { discordId, actorDiscordId } = req.body || {};

    if (!isDiscordId(discordId)) {
      return res.status(400).json({ error: 'Invalid or missing discordId' });
    }

    const accountResult = await db.execute({
      sql: 'SELECT * FROM accounts WHERE discord_id = ? AND verified = 1',
      args: [discordId],
    });
    const account = accountResult.rows[0];

    if (!account) {
      return res.status(404).json({ error: 'No verified account found for this discordId' });
    }

    const now = Date.now();
    await db.execute({
      sql: `UPDATE accounts SET verified = 0, roblox_id = NULL, roblox_username = NULL, updated_at = ? WHERE id = ?`,
      args: [now, account.id],
    });

    await logAudit('UNVERIFY', discordId, account.roblox_id, `Unlinked by ${actorDiscordId || 'unknown'}`);

    res.json({ success: true, robloxId: account.roblox_id, robloxUsername: account.roblox_username });
  })
);

module.exports = router;
