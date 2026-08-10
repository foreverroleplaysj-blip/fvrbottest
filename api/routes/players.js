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

module.exports = router;
