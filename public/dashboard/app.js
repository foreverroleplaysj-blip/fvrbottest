// public/dashboard/app.js
// Auth flow: "Inloggen met Discord" (server-side OAuth, /auth/discord) sets
// an httpOnly session cookie — the browser never sees an API key. This
// file just calls /auth/me to find out who's logged in and which servers
// they can manage, lets them pick one, then drives the existing
// /tickets/* API using that cookie (credentials: 'include').

const state = {
  guildId: '',
  guildName: '',
  guilds: [],
  types: [],
};

const $ = (id) => document.getElementById(id);

const SELECTED_GUILD_KEY = 'ticketDashboardSelectedGuild';

function loadSelectedGuild() {
  return sessionStorage.getItem(SELECTED_GUILD_KEY) || '';
}

function saveSelectedGuild(guildId) {
  sessionStorage.setItem(SELECTED_GUILD_KEY, guildId);
}

function clearSelectedGuild() {
  sessionStorage.removeItem(SELECTED_GUILD_KEY);
}

async function api(method, path, body) {
  const res = await fetch(path, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function guildIconUrl(guild) {
  if (!guild.icon) return null;
  return `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64`;
}

function showScreen(name) {
  $('loginScreen').classList.toggle('hidden', name !== 'login');
  $('pickerScreen').classList.toggle('hidden', name !== 'picker');
  $('app').classList.toggle('hidden', name !== 'app');
}

// ---- Login screen ----
const LOGIN_ERROR_MESSAGES = {
  invalid_state: 'Inloggen mislukt (verlopen of ongeldige sessie). Probeer het opnieuw.',
  token_exchange_failed: 'Discord heeft de login geweigerd. Probeer het opnieuw.',
  access_denied: 'Je hebt het inloggen geannuleerd.',
};

function showLoginErrorFromUrl() {
  const params = new URLSearchParams(location.search);
  const err = params.get('login_error');
  if (err) {
    $('loginError').textContent = LOGIN_ERROR_MESSAGES[err] || `Inloggen mislukt: ${err}`;
    history.replaceState(null, '', location.pathname);
  }
}

// ---- Server picker ----
function renderPicker() {
  const list = $('pickerList');

  if (state.guilds.length === 0) {
    list.innerHTML =
      '<div class="empty-state">Geen servers gevonden waar je beheerrechten hebt én de bot in zit.<br />Zorg dat de bot is uitgenodigd op je server en je daar "Server beheren" of Administrator rechten hebt.</div>';
    return;
  }

  list.innerHTML = '';
  state.guilds.forEach((g) => {
    const row = document.createElement('button');
    row.className = 'picker-row';
    const iconUrl = guildIconUrl(g);
    row.innerHTML = `
      ${iconUrl
        ? `<img class="picker-icon" src="${iconUrl}" alt="" />`
        : `<div class="picker-icon picker-icon-fallback">${escapeHtml((g.name || '?').charAt(0).toUpperCase())}</div>`
      }
      <div class="picker-name">${escapeHtml(g.name)}</div>
      <span class="picker-arrow">→</span>
    `;
    row.addEventListener('click', () => selectGuild(g));
    list.appendChild(row);
  });
}

function selectGuild(guild) {
  state.guildId = guild.id;
  state.guildName = guild.name;
  saveSelectedGuild(guild.id);
  boot();
}

$('pickerLogoutBtn').addEventListener('click', logout);
$('switchServerBtn').addEventListener('click', () => {
  clearSelectedGuild();
  showScreen('picker');
});

async function logout() {
  try {
    await api('POST', '/auth/logout');
  } catch {
    // ignore — clearing local state below is enough either way
  }
  clearSelectedGuild();
  state.guildId = '';
  state.guilds = [];
  showScreen('login');
}

$('logoutBtn').addEventListener('click', logout);

// ---- Tabs ----
document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.add('hidden'));
    btn.classList.add('active');
    $(`tab-${btn.dataset.tab}`).classList.remove('hidden');

    const titles = {
      settings: ['Paneel instellingen', 'Pas het uiterlijk en gedrag van je ticket panel volledig aan.'],
      types: ['Ticket types', 'Beheer de opties die gebruikers kunnen kiezen in het panel.'],
      tickets: ['Open tickets', 'Overzicht van alle momenteel open of geclaimde tickets.'],
      giveaways: ['Giveaways', 'Overzicht van lopende en afgelopen giveaways in deze server.'],
    };
    $('pageTitle').textContent = titles[btn.dataset.tab][0];
    $('pageSubtitle').textContent = titles[btn.dataset.tab][1];

    if (btn.dataset.tab === 'tickets') loadTickets();
    if (btn.dataset.tab === 'giveaways') loadGiveaways();
  });
});

// ---- Settings tab ----
function fillSettingsForm(config) {
  $('cfg_panelTitle').value = config.panelTitle || '';
  $('cfg_panelDescription').value = config.panelDescription || '';
  $('cfg_panelColor').value = config.panelColor || '1e3a8a';
  $('cfg_panelColorPicker').value = `#${config.panelColor || '1e3a8a'}`;
  $('cfg_panelImage').value = config.panelImage || '';
  $('cfg_panelThumbnail').value = config.panelThumbnail || '';
  $('cfg_panelFooter').value = config.panelFooter || '';
  $('cfg_categoryId').value = config.categoryId || '';
  $('cfg_logChannelId').value = config.logChannelId || '';
  $('cfg_supportRoleId').value = config.supportRoleId || '';
  $('cfg_nameFormat').value = config.nameFormat || '';
  $('cfg_pingSupportRole').checked = !!config.pingSupportRole;
  $('cfg_requireCloseReason').checked = !!config.requireCloseReason;
  $('cfg_maxOpenPerUser').value = config.maxOpenPerUser || 1;
  $('cfg_welcomeMessage').value = config.welcomeMessage || '';
  $('cfg_showTicketInfo').checked = config.showTicketInfo !== false;
  updatePreview();
}

function updatePreview() {
  $('previewBar').style.background = `#${($('cfg_panelColor').value || '1e3a8a').replace('#', '')}`;
  $('previewTitle').textContent = $('cfg_panelTitle').value || 'Support Tickets';
  $('previewDesc').textContent = $('cfg_panelDescription').value || '';
  $('previewFooter').textContent = $('cfg_panelFooter').value || '';

  const thumb = $('cfg_panelThumbnail').value;
  $('previewThumb').src = thumb;
  $('previewThumb').classList.toggle('hidden', !thumb);

  const image = $('cfg_panelImage').value;
  $('previewImage').src = image;
  $('previewImage').classList.toggle('hidden', !image);
}

['cfg_panelTitle', 'cfg_panelDescription', 'cfg_panelFooter', 'cfg_panelImage', 'cfg_panelThumbnail'].forEach((id) =>
  $(id).addEventListener('input', updatePreview)
);

$('cfg_panelColorPicker').addEventListener('input', () => {
  $('cfg_panelColor').value = $('cfg_panelColorPicker').value.replace('#', '');
  updatePreview();
});
$('cfg_panelColor').addEventListener('input', () => {
  const clean = $('cfg_panelColor').value.replace('#', '');
  if (/^[0-9a-fA-F]{6}$/.test(clean)) $('cfg_panelColorPicker').value = `#${clean}`;
  updatePreview();
});

$('saveSettingsBtn').addEventListener('click', async () => {
  const btn = $('saveSettingsBtn');
  const status = $('saveStatus');
  btn.disabled = true;
  status.style.color = 'var(--success)';
  status.textContent = 'Opslaan...';

  const fields = {
    panelTitle: $('cfg_panelTitle').value,
    panelDescription: $('cfg_panelDescription').value,
    panelColor: $('cfg_panelColor').value.replace('#', '') || '1e3a8a',
    panelImage: $('cfg_panelImage').value || null,
    panelThumbnail: $('cfg_panelThumbnail').value || null,
    panelFooter: $('cfg_panelFooter').value || null,
    categoryId: $('cfg_categoryId').value || null,
    logChannelId: $('cfg_logChannelId').value || null,
    supportRoleId: $('cfg_supportRoleId').value || null,
    nameFormat: $('cfg_nameFormat').value || 'ticket-{number}',
    welcomeMessage: $('cfg_welcomeMessage').value,
    pingSupportRole: $('cfg_pingSupportRole').checked,
    requireCloseReason: $('cfg_requireCloseReason').checked,
    maxOpenPerUser: parseInt($('cfg_maxOpenPerUser').value, 10) || 1,
    showTicketInfo: $('cfg_showTicketInfo').checked,
  };

  try {
    const { config } = await api('POST', '/tickets/config', { guildId: state.guildId, ...fields });
    fillSettingsForm(config);
    status.textContent = '✅ Opgeslagen';
  } catch (err) {
    status.style.color = 'var(--danger)';
    status.textContent = `❌ ${err.message}`;
  } finally {
    btn.disabled = false;
    setTimeout(() => (status.textContent = ''), 4000);
  }
});

// ---- Types tab ----
const TYPE_FORM_FIELDS = [
  'type_label',
  'type_emoji',
  'type_key',
  'type_description',
  'type_categoryId',
  'type_supportRoleId',
  'type_nameFormat',
  'type_welcomeMessage',
  'type_maxOpenOverride',
];

state.editingTypeKey = null;

function badge(text, tone) {
  return `<span class="type-flag type-flag-${tone || 'muted'}">${escapeHtml(text)}</span>`;
}

function renderTypes() {
  $('typeCount').textContent = `${state.types.length}/25`;
  const list = $('typesList');

  if (state.types.length === 0) {
    list.innerHTML = '<div class="empty-state">Nog geen ticket types toegevoegd.</div>';
    return;
  }

  list.innerHTML = '';
  state.types.forEach((t) => {
    const row = document.createElement('div');
    row.className = 'type-row';

    const flags = [];
    if (t.claimEnabled === false) flags.push(badge('Claim uit', 'off'));
    if (t.closeEnabled === false) flags.push(badge('Sluiten uit', 'off'));
    if (t.askDescription !== false) flags.push(badge('Vraagt beschrijving', 'on'));
    if (t.maxOpenOverride) flags.push(badge(`Max ${t.maxOpenOverride}`, 'on'));

    row.innerHTML = `
      <div class="type-row-info">
        <span class="type-emoji">${t.emoji || '🎫'}</span>
        <div>
          <div class="type-label">${escapeHtml(t.label)} <span class="type-key">(${escapeHtml(t.key)})</span></div>
          ${t.description ? `<div class="type-desc">${escapeHtml(t.description)}</div>` : ''}
          ${flags.length ? `<div class="type-flags">${flags.join('')}</div>` : ''}
        </div>
      </div>
      <div class="type-row-actions">
        <button class="btn btn-ghost btn-small" data-action="edit" data-key="${escapeHtml(t.key)}">Bewerken</button>
        <button class="btn btn-danger btn-small" data-action="delete" data-key="${escapeHtml(t.key)}">Verwijderen</button>
      </div>
    `;
    row.querySelector('[data-action="edit"]').addEventListener('click', () => startEditType(t));
    row.querySelector('[data-action="delete"]').addEventListener('click', () => removeType(t.key));
    list.appendChild(row);
  });
}

async function loadTypes() {
  const { types } = await api('GET', `/tickets/types/${state.guildId}`);
  state.types = types;
  renderTypes();
}

async function removeType(key) {
  if (!confirm(`Ticket type "${key}" verwijderen?`)) return;
  try {
    await api('DELETE', `/tickets/types/${state.guildId}/${encodeURIComponent(key)}`);
    if (state.editingTypeKey === key) resetTypeForm();
    await loadTypes();
  } catch (err) {
    alert(`Verwijderen mislukt: ${err.message}`);
  }
}

function startEditType(t) {
  state.editingTypeKey = t.key;
  $('type_label').value = t.label || '';
  $('type_emoji').value = t.emoji || '';
  $('type_key').value = t.key || '';
  $('type_key').disabled = true;
  $('type_description').value = t.description || '';
  $('type_categoryId').value = t.categoryId || '';
  $('type_supportRoleId').value = t.supportRoleId || '';
  $('type_nameFormat').value = t.nameFormat || '';
  $('type_welcomeMessage').value = t.welcomeMessage || '';
  $('type_maxOpenOverride').value = t.maxOpenOverride || '';
  $('type_claimEnabled').checked = t.claimEnabled !== false;
  $('type_closeEnabled').checked = t.closeEnabled !== false;
  $('type_askDescription').checked = t.askDescription !== false;

  $('typeFormTitle').textContent = `Type bewerken — ${t.label}`;
  $('addTypeBtn').textContent = '💾 Wijzigingen opslaan';
  $('cancelEditTypeBtn').classList.remove('hidden');
  document.querySelector('[data-tab="types"]').scrollIntoView?.();
}

function resetTypeForm() {
  state.editingTypeKey = null;
  TYPE_FORM_FIELDS.forEach((id) => ($(id).value = ''));
  $('type_key').disabled = false;
  $('type_claimEnabled').checked = true;
  $('type_closeEnabled').checked = true;
  $('type_askDescription').checked = true;
  $('typeFormTitle').textContent = 'Nieuw ticket type';
  $('addTypeBtn').textContent = '➕ Type toevoegen';
  $('cancelEditTypeBtn').classList.add('hidden');
}

$('cancelEditTypeBtn').addEventListener('click', resetTypeForm);

$('addTypeBtn').addEventListener('click', async () => {
  const btn = $('addTypeBtn');
  const status = $('addTypeStatus');
  const label = $('type_label').value.trim();
  const isEditing = !!state.editingTypeKey;

  if (!label) {
    status.style.color = 'var(--danger)';
    status.textContent = '❌ Label is verplicht';
    return;
  }

  btn.disabled = true;
  status.style.color = 'var(--success)';
  status.textContent = isEditing ? 'Opslaan...' : 'Toevoegen...';

  const maxOpenRaw = $('type_maxOpenOverride').value.trim();

  const sharedFields = {
    label,
    emoji: $('type_emoji').value.trim() || null,
    description: $('type_description').value.trim() || null,
    categoryId: $('type_categoryId').value.trim() || null,
    supportRoleId: $('type_supportRoleId').value.trim() || null,
    nameFormat: $('type_nameFormat').value.trim() || null,
    welcomeMessage: $('type_welcomeMessage').value.trim() || null,
    claimEnabled: $('type_claimEnabled').checked,
    closeEnabled: $('type_closeEnabled').checked,
    askDescription: $('type_askDescription').checked,
    maxOpenOverride: maxOpenRaw ? parseInt(maxOpenRaw, 10) : null,
  };

  try {
    if (isEditing) {
      await api('PATCH', `/tickets/types/${state.guildId}/${encodeURIComponent(state.editingTypeKey)}`, sharedFields);
      status.textContent = '✅ Opgeslagen';
    } else {
      await api('POST', '/tickets/types', {
        guildId: state.guildId,
        key: $('type_key').value.trim() || undefined,
        ...sharedFields,
      });
      status.textContent = '✅ Toegevoegd';
    }
    resetTypeForm();
    await loadTypes();
  } catch (err) {
    status.style.color = 'var(--danger)';
    status.textContent = `❌ ${err.message}`;
  } finally {
    btn.disabled = false;
    setTimeout(() => (status.textContent = ''), 4000);
  }
});

// ---- Tickets tab ----
async function loadTickets() {
  const list = $('ticketsList');
  list.innerHTML = '<div class="empty-state">Laden...</div>';

  try {
    const { tickets } = await api('GET', `/tickets/list/${state.guildId}`);
    const open = tickets.filter((t) => t.status !== 'closed');

    if (open.length === 0) {
      list.innerHTML = '<div class="empty-state">Geen open tickets.</div>';
      return;
    }

    list.innerHTML = '';
    open.forEach((t) => {
      const row = document.createElement('div');
      row.className = 'ticket-row';
      row.innerHTML = `
        <div>#${String(t.ticketNumber).padStart(4, '0')} — ${escapeHtml(t.typeLabel || 'Onbekend type')}</div>
        <span class="ticket-badge ${t.claimedBy ? 'claimed' : ''}">${t.claimedBy ? 'Geclaimd' : 'Open'}</span>
      `;
      list.appendChild(row);
    });
  } catch (err) {
    list.innerHTML = `<div class="empty-state">Fout bij laden: ${escapeHtml(err.message)}</div>`;
  }
}

$('refreshTicketsBtn').addEventListener('click', loadTickets);

// ---- Giveaways tab (read-only) ----
async function loadGiveaways() {
  const activeList = $('activeGiveawaysList');
  const endedList = $('endedGiveawaysList');
  activeList.innerHTML = '<div class="empty-state">Laden...</div>';
  endedList.innerHTML = '<div class="empty-state">Laden...</div>';

  try {
    const [{ giveaways: active }, { giveaways: ended }] = await Promise.all([
      api('GET', `/giveaways/guild/${state.guildId}?status=active`),
      api('GET', `/giveaways/guild/${state.guildId}?status=ended`),
    ]);

    renderGiveawayList(activeList, active, 'Geen lopende giveaways.', (g) => `eindigt over ${formatCountdown(g.endsAt)}`);
    renderGiveawayList(endedList, ended, 'Nog geen afgelopen giveaways.', (g) =>
      g.winners?.length ? `${g.winners.length} winnaar(s)` : 'niemand deed mee'
    );
  } catch (err) {
    activeList.innerHTML = `<div class="empty-state">Fout bij laden: ${escapeHtml(err.message)}</div>`;
    endedList.innerHTML = '';
  }
}

function formatCountdown(endsAt) {
  const ms = endsAt - Date.now();
  if (ms <= 0) return 'zo';
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}u`;
  return `${Math.round(hours / 24)}d`;
}

function renderGiveawayList(container, giveaways, emptyText, badgeText) {
  if (giveaways.length === 0) {
    container.innerHTML = `<div class="empty-state">${emptyText}</div>`;
    return;
  }

  container.innerHTML = '';
  giveaways.forEach((g) => {
    const row = document.createElement('div');
    row.className = 'ticket-row';
    row.innerHTML = `
      <div>🎉 ${escapeHtml(g.prize)} — ${g.winnerCount} winnaar(s)</div>
      <span class="ticket-badge">${escapeHtml(badgeText(g))}</span>
    `;
    container.appendChild(row);
  });
}

$('refreshGiveawaysBtn').addEventListener('click', loadGiveaways);

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---- Boot into the per-server settings dashboard ----
async function boot() {
  showScreen('app');
  $('guildPill').textContent = state.guildName || state.guildId;

  try {
    const { config, types } = await api('GET', `/tickets/config/${state.guildId}`);
    fillSettingsForm(config);
    state.types = types;
    renderTypes();
    $('statusPill').textContent = '● Verbonden';
    $('statusPill').style.background = '';
    $('statusPill').style.color = '';
  } catch (err) {
    $('statusPill').textContent = '● Fout';
    $('statusPill').style.background = 'rgba(239,68,68,0.12)';
    $('statusPill').style.color = '#fca5a5';
  }
}

// ---- Entry point ----
(async function init() {
  showLoginErrorFromUrl();

  let me;
  try {
    me = await api('GET', '/auth/me');
  } catch {
    showScreen('login');
    return;
  }

  state.guilds = me.guilds || [];

  const savedGuildId = loadSelectedGuild();
  const savedGuild = state.guilds.find((g) => g.id === savedGuildId);

  if (savedGuild) {
    state.guildId = savedGuild.id;
    state.guildName = savedGuild.name;
    boot();
  } else {
    clearSelectedGuild();
    renderPicker();
    showScreen('picker');
  }
})();
