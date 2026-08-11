// api/routes/players.js
// Player-related lookups. Currently used by Roblox to check ban status on join.

const express = require('express');
const { db } = require('../database');
const { isRobloxId } = require('../utils/validate');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

// GET /players/:robloxId/ban-status
router.get(
  '/:robloxId/ban-status',
  asyncHandler(async (req, res) => {
    const { robloxId } = req.params;

    if (!isRobloxId(robloxId)) {
      return res.status(400).json({ error: 'Invalid robloxId' });
    }

    const result = await db.execute({
      sql: 'SELECT * FROM bans WHERE roblox_id = ? AND active = 1 ORDER BY created_at DESC LIMIT 1',
      args: [robloxId],
    });
    const ban = result.rows[0];

    if (!ban) {
      return res.json({ banned: false });
    }

    res.json({
      banned: true,
      reason: ban.reason,
      bannedAt: ban.created_at,
    });
  })
);

// GET /players/:robloxId/full-check
// Combines our own ban history with Roblox's own platform-wide ban status
// (i.e. whether the account has been terminated by Roblox itself).
//
// IMPORTANT LIMITATION: Roblox does NOT expose whether an account has ever
// been banned/moderated in OTHER games. Ban data is private to each
// experience's own creators — there is no public API for "has this account
// ever been banned anywhere". This endpoint can only tell you:
//   1. Whether the account is banned in OUR OWN server (from our database)
//   2. Whether the account is terminated platform-wide by Roblox itself
router.get(
  '/:robloxId/full-check',
  asyncHandler(async (req, res) => {
    const { robloxId } = req.params;

    if (!isRobloxId(robloxId)) {
      return res.status(400).json({ error: 'Invalid robloxId' });
    }

    // 1. Our own ban history (all bans, not just the active one).
    const banResult = await db.execute({
      sql: 'SELECT reason, banned_by, active, created_at FROM bans WHERE roblox_id = ? ORDER BY created_at DESC',
      args: [robloxId],
    });

    const activeBan = banResult.rows.find((b) => b.active === 1) || null;

    // 2. Roblox platform-wide status via Roblox's public Users API.
    let robloxAccount = null;
    let platformTerminated = null;
    try {
      const response = await fetch(`https://users.roblox.com/v1/users/${robloxId}`);
      if (response.status === 404) {
        // Roblox returns 404 for accounts that no longer resolve at all
        // (can indicate termination, but isn't definitive on its own).
        platformTerminated = null;
        robloxAccount = null;
      } else if (response.ok) {
        const data = await response.json();
        robloxAccount = {
          name: data.name,
          displayName: data.displayName,
          created: data.created,
        };
        platformTerminated = !!data.isBanned;
      }
    } catch (err) {
      // Roblox API unreachable — don't fail the whole request, just omit platform data.
      robloxAccount = null;
      platformTerminated = null;
    }

    res.json({
      robloxId,
      roblox: robloxAccount,
      platformTerminated, // true/false/null (null = unknown, e.g. API unreachable)
      ownServer: {
        currentlyBanned: !!activeBan,
        activeBan: activeBan
          ? { reason: activeBan.reason, bannedBy: activeBan.banned_by, bannedAt: activeBan.created_at }
          : null,
        history: banResult.rows.map((b) => ({
          reason: b.reason,
          bannedBy: b.banned_by,
          active: !!b.active,
          createdAt: b.created_at,
        })),
      },
      note: 'Roblox biedt geen publieke data over bans in ANDERE games — alleen platform-brede terminatie en onze eigen server-bans zijn te checken.',
    });
  })
);

module.exports = router;
