// api/utils/validate.js
// Shared, strict input validation. Never trust data coming from Discord or Roblox.

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const ROBLOX_ID_RE = /^[0-9]{1,20}$/;
const JOB_ID_RE = /^[a-zA-Z0-9\-]{4,64}$/; // Roblox game server JobId (GUID-like)

const ALLOWED_COMMAND_TYPES = new Set([
  'give_money',
  'remove_money',
  'set_money',
  'set_job',
  'set_rank',
  'set_gang',
  'set_gang_level',
  'ban',
  'unban',
  'kick',
  'announce',
]);

const ALLOWED_ACCOUNTS = new Set(['Contant', 'Bank']);

function isDiscordId(value) {
  return typeof value === 'string' && DISCORD_ID_RE.test(value);
}

function isRobloxId(value) {
  return (typeof value === 'string' || typeof value === 'number') && ROBLOX_ID_RE.test(String(value));
}

function isJobId(value) {
  return typeof value === 'string' && JOB_ID_RE.test(value);
}

function isValidCommandType(value) {
  return ALLOWED_COMMAND_TYPES.has(value);
}

function isValidAccount(value) {
  return ALLOWED_ACCOUNTS.has(value);
}

function isPositiveInteger(value, max = Number.MAX_SAFE_INTEGER) {
  return Number.isInteger(value) && value >= 0 && value <= max;
}

module.exports = {
  isDiscordId,
  isRobloxId,
  isJobId,
  isValidCommandType,
  isValidAccount,
  isPositiveInteger,
  ALLOWED_COMMAND_TYPES,
  ALLOWED_ACCOUNTS,
};
