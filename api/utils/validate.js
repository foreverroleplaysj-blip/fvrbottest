// api/utils/validate.js
// Shared, strict input validation. Never trust data coming from Discord or Roblox.

const DISCORD_ID_RE = /^[0-9]{15,25}$/;
const ROBLOX_ID_RE = /^[0-9]{1,20}$/;
const JOB_ID_RE = /^[a-zA-Z0-9\-]{4,64}$/; // Roblox game server JobId (GUID-like)
const HEX_COLOR_RE = /^#?[0-9a-fA-F]{6}$/;
const TICKET_KEY_RE = /^[a-z0-9_-]{1,32}$/;

const ALLOWED_COMMAND_TYPES = new Set([
  'give_money',
  'remove_money',
  'set_money',
  'set_job',
  'set_rank',
  'ban',
  'unban',
  'kick',
  'announce',
  'shutdown',
  'jumpscare',
  'revive',
  'give_item',
  'clear_inventory',
  'give_coins',
  'give_pack',
  'check_money',
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

function isHexColor(value) {
  return typeof value === 'string' && HEX_COLOR_RE.test(value);
}

function normalizeHexColor(value) {
  return value.replace('#', '').toLowerCase();
}

function isTicketKey(value) {
  return typeof value === 'string' && TICKET_KEY_RE.test(value);
}

function slugify(value, maxLength = 32) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLength) || 'ticket';
}

module.exports = {
  isDiscordId,
  isRobloxId,
  isJobId,
  isValidCommandType,
  isValidAccount,
  isPositiveInteger,
  isHexColor,
  normalizeHexColor,
  isTicketKey,
  slugify,
  ALLOWED_COMMAND_TYPES,
  ALLOWED_ACCOUNTS,
};
