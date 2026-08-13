// public/dashboard/app.js
// Talks directly to the existing /tickets API routes using the same
// X-API-Key header the bot uses. Nothing here bypasses the API's own
// validation — this is just a friendlier UI on top of it.

const state = {
  apiUrl: '',
  apiKey: '',
  guildId: '',
  types: [],
};

const $ = (id) => document.getElementById(id);

function loadSession() {
  const saved = localStorage.getItem('ticketDashboardSession');
  if (!saved) return false;
  try {
    Object.assign(state, JSON.parse(saved));
    return !!(state.apiUrl && state.apiKey && state.guildId);
  } catch {
    return false;
  }
}

function saveSession() {
  localStorage.setItem(
    'ticketDashboardSession',
    JSON.stringify({ apiUrl: state.apiUrl, apiKey: state.apiKey, guildId: state.guildId })
  );
}

async function api(method, path, body) {
  const res = await fetch(`${state.apiUrl}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': state.apiKey,
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ---- Login ----
$('loginBtn').addEventListener('click', async () => {
  const guildId = $('loginGuildId').value.trim();
  let apiUrl = $('loginApiUrl').value.trim().replace(/\/$/, '');
  const apiKey = $('loginApiKey').value.trim();

  $('loginError').textContent = '';

  if (!guildId || !apiUrl || !apiKey) {
    $('loginError').textContent = 'Vul alle velden in.';
    return;
  }
  if (!/^https?:\/\//.test(apiUrl)) apiUrl = `https://${apiUrl}`;

  state.apiUrl = apiUrl;
  state.apiKey = apiKey;
  state.guildId = guildId;

  $('loginBtn').disabled = true;
  $('loginBtn').textContent = 'Inloggen...';

  try {
    await api('GET', `/tickets/config/${guildId}`);
    saveSession();
    boot();
  } catch (err) {
    $('loginError').textContent = `Inloggen mislukt: ${err.message}`;
  } finally {
    $('loginBtn').disabled = false;
    $('loginBtn').textContent = 'Inloggen';
  }
});

$('logoutBtn').addEventListener('click', () => {
  localStorage.removeItem('ticketDashboardSession');
  location.reload();
});

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
    };
    $('pageTitle').textContent = titles[btn.dataset.tab][0];
    $('pageSubtitle').textContent = titles[btn.dataset.tab][1];

    if (btn.dataset.tab === 'tickets') loadTickets();
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
    row.innerHTML = `
      <div class="type-row-info">
        <span class="type-emoji">${t.emoji || '🎫'}</span>
        <div>
          <div class="type-label">${escapeHtml(t.label)} <span class="type-key">(${escapeHtml(t.key)})</span></div>
          ${t.description ? `<div class="type-desc">${escapeHtml(t.description)}</div>` : ''}
        </div>
      </div>
      <button class="btn btn-danger btn-small" data-key="${escapeHtml(t.key)}">Verwijderen</button>
    `;
    row.querySelector('button').addEventListener('click', () => removeType(t.key));
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
    await loadTypes();
  } catch (err) {
    alert(`Verwijderen mislukt: ${err.message}`);
  }
}

$('addTypeBtn').addEventListener('click', async () => {
  const btn = $('addTypeBtn');
  const status = $('addTypeStatus');
  const label = $('type_label').value.trim();

  if (!label) {
    status.style.color = 'var(--danger)';
    status.textContent = '❌ Label is verplicht';
    return;
  }

  btn.disabled = true;
  status.style.color = 'var(--success)';
  status.textContent = 'Toevoegen...';

  const body = {
    guildId: state.guildId,
    label,
    emoji: $('type_emoji').value.trim() || undefined,
    key: $('type_key').value.trim() || undefined,
    description: $('type_description').value.trim() || undefined,
    categoryId: $('type_categoryId').value.trim() || undefined,
    supportRoleId: $('type_supportRoleId').value.trim() || undefined,
    nameFormat: $('type_nameFormat').value.trim() || undefined,
    welcomeMessage: $('type_welcomeMessage').value.trim() || undefined,
  };

  try {
    await api('POST', '/tickets/types', body);
    status.textContent = '✅ Toegevoegd';
    ['type_label', 'type_emoji', 'type_key', 'type_description', 'type_categoryId', 'type_supportRoleId', 'type_nameFormat', 'type_welcomeMessage'].forEach(
      (id) => ($(id).value = '')
    );
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

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str ?? '';
  return div.innerHTML;
}

// ---- Boot ----
async function boot() {
  $('loginScreen').classList.add('hidden');
  $('app').classList.remove('hidden');
  $('guildPill').textContent = state.guildId;

  try {
    const { config, types } = await api('GET', `/tickets/config/${state.guildId}`);
    fillSettingsForm(config);
    state.types = types;
    renderTypes();
    $('statusPill').textContent = '● Verbonden';
  } catch (err) {
    $('statusPill').textContent = '● Fout';
    $('statusPill').style.background = 'rgba(239,68,68,0.12)';
    $('statusPill').style.color = '#fca5a5';
  }
}

if (loadSession()) {
  boot();
}
