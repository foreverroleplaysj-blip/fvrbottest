// start.js
// Combined entry point: runs the Forever RP API and the Discord bot
// in a single Node.js process. Use this when you only want (or can only
// afford) ONE hosted service — e.g. a single Render Web Service — instead
// of a separate API service + background worker.
//
// Run with: node start.js
// (or: npm run start:all)
//
// Why this works: Render (and most PaaS providers) require a Web Service
// to bind to the assigned $PORT. The bot itself doesn't need a port — it
// connects out to Discord's gateway — so by loading both in the same
// process, Render sees the API's app.listen() as the "web service" while
// the bot quietly runs alongside it in the background.

console.log('[START] Forever RP — gecombineerde modus (API + Bot in 1 proces)');

// Starts the Express API and binds to process.env.PORT / API_PORT.
require('./api/server');

// Logs the Discord bot in and starts listening for interactions.
require('./bot/index');
