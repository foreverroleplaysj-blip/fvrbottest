// api/routes/servers.js
const express = require('express');
const db = require('../database');

const router = express.Router();

const OFFLINE_THRESHOLD_MS = 15 * 1000; // Servers offline if no heartbeat in 15s

// GET /servers/online
router.get('/online', (req, res) => {
  const cutoff = Date.now() - OFFLINE_THRESHOLD_MS;

  // Clean up stale server rows so they don't linger forever.
  db.prepare('DELETE FROM servers WHERE last_heartbeat < ?').run(Date.now() - 24 * 60 * 60 * 1000);

  const servers = db
    .prepare('SELECT job_id, players, max_players, last_heartbeat FROM servers WHERE last_heartbeat >= ?')
    .all(cutoff);

  res.json({ servers });
});

module.exports = router;
