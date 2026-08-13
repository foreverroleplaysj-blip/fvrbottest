// bot/handlers/ticketInteractions.js
const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');
const { closeTicketChannel, canManageTickets } = require('../utils/ticketActions');
const {
  hexToInt,
  formatTemplate,
  sanitizeChannelName,
  ticketControlRow,
} = require('../utils/tickets');

async function handleTicketSelect(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const typeKey = interaction.values[0];
  const guild = interaction.guild;

  try {
    const { config, types } = await api.getTicketConfig(interaction.guildId);
    const type = types.find((t) => t.key === typeKey);

    if (!type) {
      await interaction.editReply({ embeds: [embeds.error('Onbekend type', 'Dit ticket-type bestaat niet meer. Vraag een teamlid het panel te vernieuwen.')] });
      return;
    }

    const { count } = await api.getOpenTicketCount(interaction.guildId, interaction.user.id);
    if (count >= config.maxOpenPerUser) {
      await interaction.editReply({
        embeds: [embeds.warning('Limiet bereikt', `Je hebt al ${count} open ticket(s). Sluit een bestaand ticket voordat je een nieuwe opent.`)],
      });
      return;
    }

    const categoryId = type.categoryId || config.categoryId;
    const supportRoleId = type.supportRoleId || config.supportRoleId;
    const nameFormat = type.nameFormat || config.nameFormat;
    const welcomeTemplate = type.welcomeMessage || config.welcomeMessage;

    const channelName = sanitizeChannelName(
      formatTemplate(nameFormat, { number: config.ticketCounter + 1, user: interaction.user.username, type: type.key })
    );

    const overwrites = [
      { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.ViewChannel] },
      {
        id: interaction.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory, PermissionFlagsBits.AttachFiles],
      },
      {
        id: interaction.client.user.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels, PermissionFlagsBits.ReadMessageHistory],
      },
    ];
    if (supportRoleId) {
      overwrites.push({
        id: supportRoleId,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory],
      });
    }

    const channel = await guild.channels.create({
      name: channelName,
      type: ChannelType.GuildText,
      parent: categoryId || undefined,
      permissionOverwrites: overwrites,
      topic: `Ticket geopend door ${interaction.user.tag} (${interaction.user.id}) — type: ${type.label}`,
    });

    const { ticketNumber } = await api.createTicketRecord({
      guildId: interaction.guildId,
      channelId: channel.id,
      openerId: interaction.user.id,
      typeKey: type.key,
      typeLabel: type.label,
    });

    const welcomeEmbed = embeds.custom({
      title: `${type.emoji ? `${type.emoji} ` : '🎫 '}Ticket #${String(ticketNumber).padStart(4, '0')} — ${type.label}`,
      description: formatTemplate(welcomeTemplate, { user: `<@${interaction.user.id}>`, type: type.label }),
      color: hexToInt(config.panelColor),
      footer: config.panelFooter,
    });

    await channel.send({ embeds: [welcomeEmbed], components: [ticketControlRow()] });

    if (config.pingSupportRole && supportRoleId) {
      const ping = await channel.send({ content: `<@&${supportRoleId}>` });
      await ping.delete().catch(() => {});
    }

    await interaction.editReply({ embeds: [embeds.success('Ticket aangemaakt', `Je ticket is geopend: ${channel}`)] });

    await logger.auditLog(interaction.client, {
      action: 'TICKET_OPEN',
      discordId: interaction.user.id,
      details: `Ticket #${ticketNumber} (${type.label}) geopend in ${channel.name}`,
    });
  } catch (err) {
    logger.error(`Ticket aanmaken mislukt: ${err.message}`);
    await interaction.editReply({ embeds: [embeds.error('Aanmaken mislukt', err.message)] });
  }
}

async function handleClaimButton(interaction) {
  if (!canManageTickets(interaction)) {
    await interaction.reply({ embeds: [embeds.error('Geen toestemming', 'Alleen teamleden kunnen tickets claimen.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.deferReply();

  try {
    const ticket = await api.getTicketByChannel(interaction.channelId);
    await api.claimTicket(interaction.channelId, interaction.user.id);

    await interaction.message.edit({ components: [ticketControlRow({ claimed: true })] }).catch(() => {});

    await interaction.editReply({
      embeds: [embeds.success('Ticket geclaimd', `🙋 <@${interaction.user.id}> behandelt dit ticket (#${String(ticket.ticketNumber).padStart(4, '0')}).`)],
    });
  } catch (err) {
    await interaction.editReply({ embeds: [embeds.error('Claimen mislukt', err.message)] });
  }
}

async function handleCloseButton(interaction) {
  await interaction.deferReply();

  try {
    const ticket = await api.getTicketByChannel(interaction.channelId);

    const isOpener = interaction.user.id === ticket.openerId;
    if (!isOpener && !canManageTickets(interaction)) {
      await interaction.editReply({ embeds: [embeds.error('Geen toestemming', 'Alleen de opener of een teamlid kan dit ticket sluiten.')] });
      return;
    }

    const { config } = await api.getTicketConfig(interaction.guildId);

    await closeTicketChannel({
      interaction,
      channel: interaction.channel,
      ticket,
      config,
      closedBy: interaction.user,
      reason: 'Gesloten via paneel',
    });

    await interaction.message.edit({ components: [ticketControlRow({ closed: true })] }).catch(() => {});
    await interaction.editReply({ embeds: [embeds.success('Ticket gesloten', 'Het kanaal is vergrendeld en de transcript is opgeslagen.')] });
  } catch (err) {
    await interaction.editReply({ embeds: [embeds.error('Sluiten mislukt', err.message)] });
  }
}

async function handleDeleteButton(interaction) {
  if (!canManageTickets(interaction)) {
    await interaction.reply({ embeds: [embeds.error('Geen toestemming', 'Alleen teamleden kunnen ticket-kanalen verwijderen.')], flags: MessageFlags.Ephemeral });
    return;
  }

  await interaction.reply({ embeds: [embeds.info('Kanaal wordt verwijderd', 'Dit ticket-kanaal wordt over enkele seconden verwijderd...')] });

  setTimeout(() => {
    interaction.channel.delete().catch((err) => logger.warn(`Kon ticket-kanaal niet verwijderen: ${err.message}`));
  }, 3000);
}

/** Entry point called from bot/index.js's interactionCreate handler. */
async function handleTicketInteraction(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_panel_select') {
    return handleTicketSelect(interaction);
  }

  if (interaction.isButton()) {
    if (interaction.customId === 'ticket_claim') return handleClaimButton(interaction);
    if (interaction.customId === 'ticket_close') return handleCloseButton(interaction);
    if (interaction.customId === 'ticket_delete') return handleDeleteButton(interaction);
  }

  return false;
}

function isTicketInteraction(interaction) {
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_panel_select') return true;
  if (interaction.isButton() && ['ticket_claim', 'ticket_close', 'ticket_delete'].includes(interaction.customId)) return true;
  return false;
}

module.exports = { handleTicketInteraction, isTicketInteraction };
