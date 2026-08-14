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
const ticketsRoutes = require('./routes/tickets');
const giveawaysRoutes = require('./routes/giveaways');
const welcomeRoutes = require('./routes/welcome');
const authRoutes = require('./routes/auth');
const discordGuildsRoutes = require('./routes/discordGuilds');
const { initDb } = require('./database');
const config = require('./config');
const { requireApiKey } = require('./middleware/auth');

const API_KEY = config.apiKey;
// Render (and most PaaS providers) assign the port dynamically via PORT.
// Falls back to API_PORT for local development.
const PORT = parseInt(process.env.PORT, 10) || parseInt(process.env.API_PORT, 10) || 3000;

if (!API_KEY) {
  console.error('[FATAL] API_KEY is niet ingesteld in .env — de server start niet zonder deze secret.');
  process.exit(1);
}

if (!config.session.secret) {
  console.error('[FATAL] SESSION_SECRET is niet ingesteld in .env — nodig om dashboard-logins veilig te ondertekenen.');
  process.exit(1);
}

if (!config.discord.clientId || !config.discord.clientSecret) {
  console.warn(
    '[CONFIG WARNING] DISCORD_CLIENT_ID / DISCORD_CLIENT_SECRET ontbreken — "Inloggen met Discord" op het dashboard werkt dan niet.'
  );
}

const app = express();

const path = require('path');

app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false }));
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

// ---- Uptime check ----
// Simpele root route zodat UptimeRobot (of vergelijkbare monitors) via een
// GET- of HEAD-request kan controleren of de Render-server online is.
// Geen auth vereist, geen /healthz — bewust op '/' gehouden.
app.get('/', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

app.head('/', (req, res) => {
  res.status(200).end();
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: Date.now() });
});

app.use('/verification', requireApiKey, verificationRoutes);
app.use('/commands', requireApiKey, commandsRoutes);
app.use('/roblox', requireApiKey, robloxRoutes);
app.use('/servers', requireApiKey, serversRoutes);
app.use('/players', requireApiKey, playersRoutes);
// Ticket routes have mixed auth: bot-only endpoints require X-API-Key,
// dashboard-facing endpoints accept either X-API-Key or a Discord-login
// session scoped to that guild — see the per-route middleware inside
// routes/tickets.js.
app.use('/tickets', ticketsRoutes);

// Giveaway routes have the same mixed auth as tickets: bot-only endpoints
// require X-API-Key, dashboard-facing endpoints also accept a Discord-login
// session scoped to that guild — see the per-route middleware inside
// routes/giveaways.js.
app.use('/giveaways', giveawaysRoutes);

// Welcome-message routes: same mixed auth (bot's X-API-Key, or a
// dashboard session scoped to that guild) — see routes/welcome.js.
app.use('/welcome', welcomeRoutes);

// ---- Dashboard login ("Inloggen met Discord") ----
// No requireApiKey here — this is what lets the browser authenticate
// without ever holding the API key.
app.use('/auth', authRoutes);

// ---- Bot -> API sync of which Discord servers the bot is currently in ----
app.use('/discord-guilds', requireApiKey, discordGuildsRoutes);

// ---- Dashboard (static; the page itself authenticates via the
// httpOnly session cookie set by /auth, not a key typed into the UI) ----
app.use('/dashboard', express.static(path.join(__dirname, '..', 'public', 'dashboard')));

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

(async () => {
  try {
    await initDb();
    console.log('[API] Database schema geïnitialiseerd.');
  } catch (err) {
    console.error('[FATAL] Kon database niet initialiseren:', err);
    process.exit(1);
  }

  app.listen(PORT, () => {
    console.log(`[API] Forever RP API luistert op poort ${PORT}`);
  });
})();
