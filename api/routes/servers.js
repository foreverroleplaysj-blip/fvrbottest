// api/routes/servers.js
const express = require('express');
const { db } = require('../database');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

const OFFLINE_THRESHOLD_MS = 15 * 1000; // Servers offline if no heartbeat in 15s

// GET /servers/online
router.get(
  '/online',
  asyncHandler(async (req, res) => {
    const cutoff = Date.now() - OFFLINE_THRESHOLD_MS;

    // Clean up stale server rows so they don't linger forever.
    await db.execute({
      sql: 'DELETE FROM servers WHERE last_heartbeat < ?',
      args: [Date.now() - 24 * 60 * 60 * 1000],
    });

    const result = await db.execute({
      sql: 'SELECT job_id, players, max_players, last_heartbeat FROM servers WHERE last_heartbeat >= ?',
      args: [cutoff],
    });

    res.json({ servers: result.rows });
  })
);

module.exports = router;
