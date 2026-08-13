// bot/utils/ticketDb.js
// Database helpers for the fully configurable ticket panel system.
// Talks directly to the shared libSQL/SQLite database (same one the API
// uses) — tickets are a Discord-only feature so there's no need to round-trip
// through the HTTP API for this.

const { db, initDb } = require('../../api/database');

// ---- Panels ----

async function createPanel({ guildId, panelKey, title, description, createdBy }) {
  const now = Date.now();
  await db.execute({
    sql: `INSERT INTO ticket_panels (guild_id, panel_key, title, description, created_by, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [guildId, panelKey, title, description, createdBy, now, now],
  });
  return getPanelByKey(guildId, panelKey);
}

async function getPanelByKey(guildId, panelKey) {
  const res = await db.execute({
    sql: `SELECT * FROM ticket_panels WHERE guild_id = ? AND panel_key = ?`,
    args: [guildId, panelKey],
  });
  return res.rows[0] || null;
}

async function getPanelById(id) {
  const res = await db.execute({
    sql: `SELECT * FROM ticket_panels WHERE id = ?`,
    args: [id],
  });
  return res.rows[0] || null;
}

async function listPanels(guildId) {
  const res = await db.execute({
    sql: `SELECT * FROM ticket_panels WHERE guild_id = ? ORDER BY created_at ASC`,
    args: [guildId],
  });
  return res.rows;
}

const PANEL_FIELDS = new Set([
  'channel_id',
  'message_id',
  'title',
  'description',
  'color',
  'image_url',
  'thumbnail_url',
  'footer_text',
  'category_channel_id',
  'log_channel_id',
  'support_role_id',
  'ping_role_id',
  'max_open_per_user',
  'naming_format',
  'welcome_message',
]);

async function updatePanel(id, fields) {
  const keys = Object.keys(fields).filter((k) => PANEL_FIELDS.has(k));
  if (keys.length === 0) return getPanelById(id);

  const setClause = keys.map((k) => `${k} = ?`).join(', ');
  const args = keys.map((k) => fields[k]);
  args.push(Date.now(), id);

  await db.execute({
    sql: `UPDATE ticket_panels SET ${setClause}, updated_at = ? WHERE id = ?`,
    args,
  });
  return getPanelById(id);
}

async function deletePanel(id) {
  await db.execute({ sql: `DELETE FROM ticket_categories WHERE panel_id = ?`, args: [id] });
  await db.execute({ sql: `DELETE FROM ticket_panels WHERE id = ?`, args: [id] });
}

// ---- Categories ----

async function addCategory({ panelId, label, emoji, style, description, questions, sortOrder }) {
  const now = Date.now();
  const res = await db.execute({
    sql: `INSERT INTO ticket_categories (panel_id, label, emoji, style, description, questions, sort_order, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      panelId,
      label,
      emoji || null,
      style || 'Primary',
      description || null,
      JSON.stringify(questions || []),
      sortOrder ?? 0,
      now,
    ],
  });
  return getCategoryById(Number(res.lastInsertRowid));
}

async function getCategories(panelId) {
  const res = await db.execute({
    sql: `SELECT * FROM ticket_categories WHERE panel_id = ? ORDER BY sort_order ASC, id ASC`,
    args: [panelId],
  });
  return res.rows.map((row) => ({ ...row, questions: JSON.parse(row.questions || '[]') }));
}

async function getCategoryById(id) {
  const res = await db.execute({
    sql: `SELECT * FROM ticket_categories WHERE id = ?`,
    args: [id],
  });
  const row = res.rows[0];
  if (!row) return null;
  return { ...row, questions: JSON.parse(row.questions || '[]') };
}

async function removeCategory(id) {
  await db.execute({ sql: `DELETE FROM ticket_categories WHERE id = ?`, args: [id] });
}

async function countCategories(panelId) {
  const res = await db.execute({
    sql: `SELECT COUNT(*) as count FROM ticket_categories WHERE panel_id = ?`,
    args: [panelId],
  });
  return Number(res.rows[0]?.count || 0);
}

// ---- Tickets ----

async function createTicket({ guildId, panelId, categoryId, channelId, openerId }) {
  const now = Date.now();
  const res = await db.execute({
    sql: `INSERT INTO tickets (guild_id, panel_id, category_id, channel_id, opener_id, status, created_at)
          VALUES (?, ?, ?, ?, ?, 'open', ?)`,
    args: [guildId, panelId, categoryId, channelId, openerId, now],
  });
  return getTicketById(Number(res.lastInsertRowid));
}

async function getTicketById(id) {
  const res = await db.execute({ sql: `SELECT * FROM tickets WHERE id = ?`, args: [id] });
  return res.rows[0] || null;
}

async function getTicketByChannel(channelId) {
  const res = await db.execute({
    sql: `SELECT * FROM tickets WHERE channel_id = ?`,
    args: [channelId],
  });
  return res.rows[0] || null;
}

async function countOpenTicketsForUser(guildId, openerId) {
  const res = await db.execute({
    sql: `SELECT COUNT(*) as count FROM tickets WHERE guild_id = ? AND opener_id = ? AND status != 'closed'`,
    args: [guildId, openerId],
  });
  return Number(res.rows[0]?.count || 0);
}

async function claimTicket(id, staffId) {
  await db.execute({
    sql: `UPDATE tickets SET status = 'claimed', claimed_by = ? WHERE id = ?`,
    args: [staffId, id],
  });
  return getTicketById(id);
}

async function setTicketLocked(id, locked) {
  await db.execute({
    sql: `UPDATE tickets SET locked = ? WHERE id = ?`,
    args: [locked ? 1 : 0, id],
  });
  return getTicketById(id);
}

async function closeTicket(id, closedBy) {
  await db.execute({
    sql: `UPDATE tickets SET status = 'closed', closed_by = ?, closed_at = ? WHERE id = ?`,
    args: [closedBy, Date.now(), id],
  });
  return getTicketById(id);
}

module.exports = {
  initDb,
  createPanel,
  getPanelByKey,
  getPanelById,
  listPanels,
  updatePanel,
  deletePanel,
  addCategory,
  getCategories,
  getCategoryById,
  removeCategory,
  countCategories,
  createTicket,
  getTicketById,
  getTicketByChannel,
  countOpenTicketsForUser,
  claimTicket,
  setTicketLocked,
  closeTicket,
};