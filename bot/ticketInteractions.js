// bot/handlers/ticketInteractions.js
// Routes all `tk:*` component/modal interactions: opening tickets from a
// panel, answering the intake modal, and the in-ticket control buttons
// (claim / lock / unlock / transcript / close).

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  MessageFlags,
} = require('discord.js');
const ticketDb = require('./utils/ticketDb');
const tickets = require('./utils/tickets');
const embeds = require('./utils/embeds');
const permissions = require('./utils/permissions');
const logger = require('./utils/logger');

function isTicketInteraction(interaction) {
  return typeof interaction.customId === 'string' && interaction.customId.startsWith('tk:');
}

// ---- Opening a ticket (button or select menu) ----

async function startTicketFlow(interaction, panelId, categoryId) {
  const panel = await ticketDb.getPanelById(panelId);
  const category = await ticketDb.getCategoryById(categoryId);

  if (!panel || !category || category.panel_id !== panel.id) {
    await interaction.reply({
      embeds: [embeds.error('Onbekend paneel', 'Dit ticketpaneel of deze categorie bestaat niet meer.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const openCount = await ticketDb.countOpenTicketsForUser(interaction.guild.id, interaction.user.id);
  if (openCount >= panel.max_open_per_user) {
    await interaction.reply({
      embeds: [
        embeds.warning(
          'Limiet bereikt',
          `Je hebt al **${openCount}** open ticket(s). Sluit een bestaand ticket voordat je een nieuwe opent.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (category.questions.length > 0) {
    const modal = new ModalBuilder()
      .setCustomId(`tk:modal:${panel.id}:${category.id}`)
      .setTitle(category.label.slice(0, 45));

    category.questions.slice(0, 5).forEach((q, idx) => {
      const input = new TextInputBuilder()
        .setCustomId(`q${idx}`)
        .setLabel(String(q.label).slice(0, 45))
        .setStyle(q.style === 'Paragraph' ? TextInputStyle.Paragraph : TextInputStyle.Short)
        .setRequired(q.required !== false)
        .setMaxLength(q.style === 'Paragraph' ? 1000 : 200);
      if (q.placeholder) input.setPlaceholder(String(q.placeholder).slice(0, 100));
      modal.addComponents(new ActionRowBuilder().addComponents(input));
    });

    await interaction.showModal(modal);
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  await openTicketNow(interaction, panel, category, []);
}

async function openTicketNow(interaction, panel, category, answers) {
  try {
    const { channel } = await tickets.createTicketChannel({
      guild: interaction.guild,
      panel,
      category,
      opener: interaction.user,
      answers,
    });

    await interaction.editReply({
      embeds: [embeds.success('Ticket geopend', `Je ticket is aangemaakt: ${channel}`)],
    });
  } catch (err) {
    logger.error('Fout bij aanmaken ticket:', err);
    await interaction.editReply({
      embeds: [embeds.error('Aanmaken mislukt', 'Kon geen ticketkanaal aanmaken. Controleer of de bot voldoende rechten heeft.')],
    });
  }
}

async function handleButton(interaction) {
  const parts = interaction.customId.split(':');
  const [, action] = parts;

  if (action === 'open') {
    const [, , panelId, categoryId] = parts;
    await startTicketFlow(interaction, Number(panelId), Number(categoryId));
    return;
  }

  if (['claim', 'lock', 'unlock', 'transcript', 'close', 'closeconfirm', 'closecancel'].includes(action)) {
    const ticketId = Number(parts[2]);
    await handleTicketAction(interaction, action, ticketId);
    return;
  }
}

async function handleSelectMenu(interaction) {
  const parts = interaction.customId.split(':');
  const [, action, panelId] = parts;

  if (action === 'select') {
    const categoryId = Number(interaction.values[0]);
    await startTicketFlow(interaction, Number(panelId), categoryId);
  }
}

async function handleModalSubmit(interaction) {
  const parts = interaction.customId.split(':');
  const [, action, panelId, categoryId] = parts;
  if (action !== 'modal') return;

  const panel = await ticketDb.getPanelById(Number(panelId));
  const category = await ticketDb.getCategoryById(Number(categoryId));

  if (!panel || !category) {
    await interaction.reply({
      embeds: [embeds.error('Onbekend paneel', 'Dit ticketpaneel of deze categorie bestaat niet meer.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const answers = category.questions.map((q, idx) => ({
    question: q.label,
    value: interaction.fields.getTextInputValue(`q${idx}`),
  }));

  await openTicketNow(interaction, panel, category, answers);
}

// ---- In-ticket control buttons ----

async function handleTicketAction(interaction, action, ticketId) {
  const ticket = await ticketDb.getTicketById(ticketId);
  if (!ticket) {
    await interaction.reply({
      embeds: [embeds.error('Ticket niet gevonden', 'Dit ticket bestaat niet meer in de database.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (ticket.channel_id !== interaction.channelId) {
    await interaction.reply({
      embeds: [embeds.error('Ongeldig kanaal', 'Dit ticket hoort niet bij dit kanaal.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const staff = permissions.isStaff(interaction);
  const isOpener = interaction.user.id === ticket.opener_id;

  if (action === 'claim') {
    if (!staff) return denyStaffOnly(interaction);
    const updated = await ticketDb.claimTicket(ticket.id, interaction.user.id);
    await interaction.update({ components: [tickets.buildTicketControlRow(updated)] });
    await interaction.followUp({
      embeds: [embeds.info('Ticket geclaimd', `<@${interaction.user.id}> behandelt dit ticket nu.`)],
    });
    return;
  }

  if (action === 'lock' || action === 'unlock') {
    if (!staff) return denyStaffOnly(interaction);
    const locked = action === 'lock';
    const updated = await ticketDb.setTicketLocked(ticket.id, locked);
    await interaction.channel.permissionOverwrites
      .edit(ticket.opener_id, { SendMessages: !locked })
      .catch(() => {});
    await interaction.update({ components: [tickets.buildTicketControlRow(updated)] });
    await interaction.followUp({
      embeds: [
        locked
          ? embeds.warning('Ticket vergrendeld', 'De opener kan nu geen berichten meer sturen.')
          : embeds.info('Ticket ontgrendeld', 'De opener kan weer berichten sturen.'),
      ],
    });
    return;
  }

  if (action === 'transcript') {
    if (!staff) return denyStaffOnly(interaction);
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const attachment = await tickets.generateTranscript(interaction.channel);
    await interaction.editReply({ files: [attachment] });
    return;
  }

  if (action === 'close') {
    if (!staff && !isOpener) {
      await interaction.reply({
        embeds: [embeds.error('Geen toegang', 'Alleen de opener of het support team kan dit ticket sluiten.')],
        flags: MessageFlags.Ephemeral,
      });
      return;
    }
    await interaction.reply({
      content: 'Weet je zeker dat je dit ticket wilt sluiten? Er wordt een transcript opgeslagen.',
      components: [tickets.buildCloseConfirmRow(ticket.id)],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  if (action === 'closecancel') {
    await interaction.update({ content: 'Sluiten geannuleerd.', components: [] });
    return;
  }

  if (action === 'closeconfirm') {
    if (!staff && !isOpener) return denyStaffOnly(interaction);
    await interaction.update({ content: '⏳ Ticket wordt gesloten en transcript wordt opgeslagen...', components: [] });
    await finalizeTicketClose(interaction, ticket);
  }
}

async function denyStaffOnly(interaction) {
  await interaction.reply({
    embeds: [embeds.error('Geen toegang', 'Alleen support/management mag dit doen.')],
    flags: MessageFlags.Ephemeral,
  });
}

async function finalizeTicketClose(interaction, ticket) {
  try {
    const channel = interaction.channel;
    const panel = ticket.panel_id ? await ticketDb.getPanelById(ticket.panel_id) : null;
    const category = ticket.category_id ? await ticketDb.getCategoryById(ticket.category_id) : null;

    const attachment = await tickets.generateTranscript(channel);
    const closed = await ticketDb.closeTicket(ticket.id, interaction.user.id);

    if (panel?.log_channel_id) {
      const logChannel = await interaction.guild.channels.fetch(panel.log_channel_id).catch(() => null);
      if (logChannel && logChannel.isTextBased()) {
        await logChannel
          .send({
            embeds: [
              tickets.buildTicketLogEmbed({
                ticket: closed,
                channel,
                category,
                closedByTag: `<@${interaction.user.id}>`,
              }),
            ],
            files: [attachment],
          })
          .catch(() => {});
      }
    }

    await logger.auditLog(interaction.client, {
      action: 'TICKET_CLOSED',
      discordId: interaction.user.id,
      details: `Ticket #${ticket.id} (#${channel.name}) gesloten`,
    });

    setTimeout(() => {
      channel.delete(`Ticket #${ticket.id} gesloten door ${interaction.user.tag}`).catch(() => {});
    }, 5000);
  } catch (err) {
    logger.error('Fout bij sluiten ticket:', err);
    await interaction.followUp({
      embeds: [embeds.error('Fout', 'Er ging iets mis bij het sluiten van dit ticket.')],
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
  }
}

module.exports = {
  isTicketInteraction,
  handleButton,
  handleSelectMenu,
  handleModalSubmit,
};