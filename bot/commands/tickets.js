// bot/utils/tickets.js
// Core logic for the configurable ticket panel system: embed/component
// builders, ticket channel creation, control buttons and transcripts.

const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
  ChannelType,
  AttachmentBuilder,
} = require('discord.js');
const ticketDb = require('./ticketDb');

const STYLE_MAP = {
  Primary: ButtonStyle.Primary,
  Secondary: ButtonStyle.Secondary,
  Success: ButtonStyle.Success,
  Danger: ButtonStyle.Danger,
};

const DEFAULT_COLOR = 0x1e3a8a;

function parseColor(hex) {
  if (!hex) return DEFAULT_COLOR;
  const clean = String(hex).replace('#', '').trim();
  const parsed = parseInt(clean, 16);
  return Number.isNaN(parsed) ? DEFAULT_COLOR : parsed;
}

function isValidHexColor(hex) {
  return /^#?[0-9a-fA-F]{6}$/.test(hex);
}

function slugify(text, fallback = 'ticket') {
  const slug = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
  return slug || fallback;
}

// ---- Panel embed / components ----

function buildPanelEmbed(panel) {
  const embed = new EmbedBuilder()
    .setColor(parseColor(panel.color))
    .setTitle(panel.title || 'Support Tickets')
    .setDescription(panel.description || 'Klik op een knop hieronder om een ticket te openen.')
    .setFooter({ text: panel.footer_text || 'Forever Roleplay • Ticket Systeem' })
    .setTimestamp();

  if (panel.image_url) embed.setImage(panel.image_url);
  if (panel.thumbnail_url) embed.setThumbnail(panel.thumbnail_url);

  return embed;
}

function buildPanelComponents(panel, categories) {
  if (categories.length === 0) return [];

  if (categories.length <= 5) {
    const row = new ActionRowBuilder();
    for (const cat of categories) {
      const button = new ButtonBuilder()
        .setCustomId(`tk:open:${panel.id}:${cat.id}`)
        .setLabel(cat.label.slice(0, 80))
        .setStyle(STYLE_MAP[cat.style] || ButtonStyle.Primary);
      if (cat.emoji) button.setEmoji(cat.emoji);
      row.addComponents(button);
    }
    return [row];
  }

  // More than 5 categories — a dropdown scales up to 25 options.
  const select = new StringSelectMenuBuilder()
    .setCustomId(`tk:select:${panel.id}`)
    .setPlaceholder('Kies een categorie om een ticket te openen')
    .addOptions(
      categories.slice(0, 25).map((cat) => ({
        label: cat.label.slice(0, 100),
        value: String(cat.id),
        description: cat.description ? cat.description.slice(0, 100) : undefined,
        emoji: cat.emoji || undefined,
      }))
    );

  return [new ActionRowBuilder().addComponents(select)];
}

// ---- Ticket channel naming ----

async function nextTicketNumber(guildId) {
  const panels = await ticketDb.listPanels(guildId);
  // Cheap-ish counter: count all tickets ever opened in this guild.
  const { db } = require('../../api/database');
  const res = await db.execute({
    sql: `SELECT COUNT(*) as count FROM tickets WHERE guild_id = ?`,
    args: [guildId],
  });
  void panels; // (kept for future per-panel numbering; currently guild-wide)
  return Number(res.rows[0]?.count || 0) + 1;
}

function buildChannelName(namingFormat, username, number) {
  const format = namingFormat || 'ticket-{username}';
  const padded = String(number).padStart(4, '0');
  const raw = format
    .replace(/\{username\}/gi, slugify(username, 'user'))
    .replace(/\{id\}/gi, padded)
    .replace(/\{number\}/gi, padded);
  return slugify(raw).slice(0, 90) || `ticket-${padded}`;
}

// ---- Ticket control buttons ----

function buildTicketControlRow(ticket) {
  const claimBtn = new ButtonBuilder()
    .setCustomId(`tk:claim:${ticket.id}`)
    .setStyle(ButtonStyle.Success)
    .setEmoji('🖐️')
    .setLabel(ticket.claimed_by ? 'Herclaim' : 'Claim');

  const lockBtn = ticket.locked
    ? new ButtonBuilder()
        .setCustomId(`tk:unlock:${ticket.id}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔓')
        .setLabel('Unlock')
    : new ButtonBuilder()
        .setCustomId(`tk:lock:${ticket.id}`)
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('🔒')
        .setLabel('Lock');

  const transcriptBtn = new ButtonBuilder()
    .setCustomId(`tk:transcript:${ticket.id}`)
    .setStyle(ButtonStyle.Secondary)
    .setEmoji('📜')
    .setLabel('Transcript');

  const closeBtn = new ButtonBuilder()
    .setCustomId(`tk:close:${ticket.id}`)
    .setStyle(ButtonStyle.Danger)
    .setEmoji('✖️')
    .setLabel('Sluiten');

  return new ActionRowBuilder().addComponents(claimBtn, lockBtn, transcriptBtn, closeBtn);
}

function buildCloseConfirmRow(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`tk:closeconfirm:${ticketId}`)
      .setStyle(ButtonStyle.Danger)
      .setLabel('Bevestig sluiten')
      .setEmoji('✅'),
    new ButtonBuilder()
      .setCustomId(`tk:closecancel:${ticketId}`)
      .setStyle(ButtonStyle.Secondary)
      .setLabel('Annuleren')
      .setEmoji('↩️')
  );
}

// ---- Ticket channel creation ----

async function createTicketChannel({ guild, panel, category, opener, answers }) {
  const number = await nextTicketNumber(guild.id);
  const name = buildChannelName(panel.naming_format, opener.username, number);

  const overwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: opener.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  if (guild.members.me) {
    overwrites.push({
      id: guild.members.me.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  if (panel.support_role_id) {
    overwrites.push({
      id: panel.support_role_id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageMessages,
      ],
    });
  }

  let parent = null;
  if (panel.category_channel_id) {
    const fetchedParent = await guild.channels.fetch(panel.category_channel_id).catch(() => null);
    if (fetchedParent && fetchedParent.type === ChannelType.GuildCategory) {
      parent = fetchedParent.id;
    }
  }

  const channel = await guild.channels.create({
    name,
    type: ChannelType.GuildText,
    parent,
    topic: `Ticket door ${opener.tag} (${opener.id}) — Categorie: ${category.label}`,
    permissionOverwrites: overwrites,
    reason: `Ticket geopend door ${opener.tag}`,
  });

  const ticket = await ticketDb.createTicket({
    guildId: guild.id,
    panelId: panel.id,
    categoryId: category.id,
    channelId: channel.id,
    openerId: opener.id,
  });

  const embed = new EmbedBuilder()
    .setColor(parseColor(panel.color))
    .setTitle(`🎫 ${category.label}`)
    .setDescription(
      panel.welcome_message ||
        `Welkom ${opener}! Beschrijf je vraag of probleem zo duidelijk mogelijk. Het support team helpt je zo snel mogelijk.`
    )
    .setFooter({ text: `Ticket #${ticket.id} • Forever Roleplay` })
    .setTimestamp();

  if (answers && answers.length > 0) {
    for (const a of answers) {
      embed.addFields({ name: a.question.slice(0, 256), value: (a.value || '—').slice(0, 1024) });
    }
  }

  const mentions = [`<@${opener.id}>`];
  if (panel.ping_role_id) mentions.push(`<@&${panel.ping_role_id}>`);

  await channel.send({
    content: mentions.join(' '),
    embeds: [embed],
    components: [buildTicketControlRow(ticket)],
  });

  return { channel, ticket };
}

// ---- Transcript generation ----

async function generateTranscript(channel) {
  const collected = [];
  let lastId;

  // Paginate backwards through channel history (Discord caps each fetch at 100).
  for (let i = 0; i < 20; i++) {
    const batch = await channel.messages.fetch({ limit: 100, before: lastId }).catch(() => null);
    if (!batch || batch.size === 0) break;
    collected.push(...batch.values());
    lastId = batch.last().id;
    if (batch.size < 100) break;
  }

  collected.sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  const lines = collected.map((m) => {
    const time = new Date(m.createdTimestamp).toISOString().replace('T', ' ').slice(0, 19);
    const author = `${m.author?.tag || 'Onbekend'} (${m.author?.id || '—'})`;
    const content = m.content || '';
    const attachments = m.attachments?.size
      ? '\n  [Bijlagen] ' + [...m.attachments.values()].map((a) => a.url).join(', ')
      : '';
    return `[${time}] ${author}: ${content}${attachments}`;
  });

  const header = [
    `Transcript van #${channel.name}`,
    `Gegenereerd op ${new Date().toISOString()}`,
    `Aantal berichten: ${collected.length}`,
    '='.repeat(60),
    '',
  ].join('\n');

  const buffer = Buffer.from(header + lines.join('\n'), 'utf-8');
  return new AttachmentBuilder(buffer, { name: `transcript-${channel.name}.txt` });
}

function buildTicketLogEmbed({ ticket, channel, category, closedByTag }) {
  return new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle(`🔒 Ticket gesloten — #${ticket.id}`)
    .addFields(
      { name: 'Kanaal', value: `#${channel.name}`, inline: true },
      { name: 'Categorie', value: category?.label || 'Onbekend', inline: true },
      { name: 'Geopend door', value: `<@${ticket.opener_id}>`, inline: true },
      { name: 'Geclaimd door', value: ticket.claimed_by ? `<@${ticket.claimed_by}>` : 'Niemand', inline: true },
      { name: 'Gesloten door', value: closedByTag || '—', inline: true },
      {
        name: 'Geopend op',
        value: `<t:${Math.floor(ticket.created_at / 1000)}:F>`,
        inline: true,
      }
    )
    .setFooter({ text: 'Forever Roleplay • Ticket Systeem' })
    .setTimestamp();
}

module.exports = {
  STYLE_MAP,
  parseColor,
  isValidHexColor,
  slugify,
  buildPanelEmbed,
  buildPanelComponents,
  buildChannelName,
  buildTicketControlRow,
  buildCloseConfirmRow,
  createTicketChannel,
  generateTranscript,
  buildTicketLogEmbed,
};