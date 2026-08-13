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

// GET /players/:robloxId/history
// Full ban history (not just active) + public Roblox account info.
// Used by /checkaccount in Discord.
router.get(
  '/:robloxId/history',
  asyncHandler(async (req, res) => {
    const { robloxId } = req.params;

    if (!isRobloxId(robloxId)) {
      return res.status(400).json({ error: 'Invalid robloxId' });
    }

    const bansResult = await db.execute({
      sql: 'SELECT reason, banned_by, active, created_at FROM bans WHERE roblox_id = ? ORDER BY created_at DESC',
      args: [robloxId],
    });

    let robloxAccount = null;
    try {
      const robloxRes = await fetch(`https://users.roblox.com/v1/users/${robloxId}`);
      if (robloxRes.ok) {
        const data = await robloxRes.json();
        robloxAccount = {
          name: data.name,
          displayName: data.displayName,
          created: data.created,
          isBanned: data.isBanned, // Roblox's own global ban/termination flag
          hasVerifiedBadge: data.hasVerifiedBadge,
        };
      }
    } catch {
      // Roblox API unreachable — proceed with just our own ban history.
    }

    res.json({
      robloxId,
      robloxAccount,
      bans: bansResult.rows.map((b) => ({
        reason: b.reason,
        bannedBy: b.banned_by,
        active: !!b.active,
        createdAt: b.created_at,
      })),
    });
  })
);

module.exports = router;
