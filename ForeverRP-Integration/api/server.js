// api/server.js
// Forever RP API — Express server.
// Handles verification, command queue, Roblox polling/heartbeat and server status.

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');

const verificationRoutes = require('./routes/verification');
const commandsRoutes = require('./routes/commands');
const robloxRoutes = require('./routes/roblox');
const serversRoutes = require('./routes/servers');
const playersRoutes = require('./routes/players');

const API_KEY = process.env.API_KEY;
// Render (and most PaaS providers) assign the port dynamically via PORT.
// Falls back to API_PORT for local development.
const PORT = parseInt(process.env.PORT, 10) || parseInt(process.env.API_PORT, 10) || 3000;

if (!API_KEY) {
  console.error('[FATAL] API_KEY is niet ingesteld in .env — de server start niet zonder deze secret.');
  process.exit(1);
}

const app = express();

app.disable('x-powered-by');
app.use(helmet());
app.use(express.json({ limit: '100kb' }));

// ---- Global rate limiting ----
// Generous global limit; per-route limits are stricter where it matters (verification).
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, slow down.' },
  })
);

// ---- API key authentication ----
// All routes except /health require a valid X-API-Key header.
function requireApiKey(req, res, next) {
  const key = req.header('X-API-Key');

  if (!key || key !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized: invalid or missing X-API-Key' });
  }

  next();
}

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.use('/verification', requireApiKey, verificationRoutes);
app.use('/commands', requireApiKey, commandsRoutes);
app.use('/roblox', requireApiKey, robloxRoutes);
app.use('/servers', requireApiKey, serversRoutes);
app.use('/players', requireApiKey, playersRoutes);

// ---- 404 handler ----
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---- Global error handler ----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[API ERROR]', err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`[API] Forever RP API luistert op poort ${PORT}`);
});
