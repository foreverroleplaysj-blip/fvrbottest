// bot/config.js
// Central configuration loaded from environment variables.
// Never hardcode secrets here — everything comes from .env

require('dotenv').config();

function required(name) {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    console.warn(`[CONFIG WARNING] Missing environment variable: ${name}`);
  }
  return value;
}

const config = {
  discord: {
    token: required('DISCORD_TOKEN'),
    clientId: required('DISCORD_CLIENT_ID'),
    guildId: required('DISCORD_GUILD_ID'),
  },

  api: {
    baseUrl: process.env.API_BASE_URL || 'http://localhost:3000',
    key: required('API_KEY'),
    port: parseInt(process.env.API_PORT, 10) || 3000,
  },

  database: {
    path: process.env.DATABASE_PATH || './data/foreverrp.sqlite',
  },

  roles: {
    staffRoleId: process.env.STAFF_ROLE_ID || null,
    managementRoleId: process.env.MANAGEMENT_ROLE_ID || null,
    auditLogChannelId: process.env.AUDIT_LOG_CHANNEL_ID || null,
  },

  limits: {
    maxMoneyAmount: parseInt(process.env.MAX_MONEY_AMOUNT, 10) || 1000000,
    maxRankLevel: parseInt(process.env.MAX_RANK_LEVEL, 10) || 20,
    maxGangLevel: parseInt(process.env.MAX_GANG_LEVEL, 10) || 10,
  },

  // Colors used across embeds — matches Forever RP branding
  colors: {
    primary: 0x1e3a8a, // Dark blue
    success: 0x10b981, // Green
    error: 0xef4444,
    warning: 0xf59e0b,
    info: 0x3b82f6,
  },

  // Allowed jobs — keep in sync with roblox/ForeverIntegration.server.lua Config.AllowedJobs
  allowedJobs: [
    'Politie',
    'KMAR',
    'Ambulance',
    'Wegenwacht',
    'DSI',
    'PostNL',
    'Vliegschool',
    'Burger',
  ],

  // Allowed gangs — keep in sync with roblox/ForeverIntegration.server.lua Config.Gangs
  allowedGangs: {
    GC: { name: 'Gaviao Commando', maxLevel: 10 },
    RZ: { name: 'Reznikov', maxLevel: 10 },
  },
};

module.exports = config;
