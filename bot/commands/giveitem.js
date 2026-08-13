// bot/commands/giveitem.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');
const { ITEMS, isValidItem } = require('../../shared/items');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveitem')
    .setDescription('[Management] Geef een item/wapen uit de Ox inventory aan een speler')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('item').setDescription('Het item (typ om te zoeken)').setRequired(true).setAutocomplete(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('aantal').setDescription('Aantal (standaard 1)').setRequired(false).setMinValue(1)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();
    const matches = ITEMS.filter((item) => item.toLowerCase().includes(focused)).slice(0, 25);
    await interaction.respond(matches.map((item) => ({ name: item, value: item })));
  },

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);
    const item = interaction.options.getString('item', true);
    const amount = interaction.options.getInteger('aantal') || 1;

    if (!isValidItem(item)) {
      await interaction.editReply({
        embeds: [embeds.error('Ongeldig item', `"${item}" staat niet op de whitelist. Gebruik de autocomplete-suggesties.`)],
      });
      return;
    }

    try {
      const verification = await api.getVerificationByDiscordId(target.id);
      if (!verification?.verified) {
        await interaction.editReply({
          embeds: [embeds.error('Speler niet geverifieerd', `<@${target.id}> heeft geen gekoppeld Roblox account.`)],
        });
        return;
      }

      const command = await api.createCommand(
        'give_item',
        verification.robloxId,
        { item, amount },
        interaction.user.id
      );

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Item gegeven',
            `<@${target.id}> (${verification.robloxUsername}) krijgt **${amount}x ${item}**.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'GIVE_ITEM',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `${amount}x ${item} door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
