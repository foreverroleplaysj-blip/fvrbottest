// bot/commands/setrank.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setrank')
    .setDescription('[Management] Stel de rank van een speler in')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('rank').setDescription('Nieuwe rank (0-' + config.limits.maxRankLevel + ')').setRequired(true).setMinValue(0)
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);
    const rank = interaction.options.getInteger('rank', true);

    if (rank > config.limits.maxRankLevel) {
      await interaction.editReply({
        embeds: [embeds.error('Rank te hoog', `Maximale rank is ${config.limits.maxRankLevel}.`)],
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

      const command = await api.createCommand('set_rank', verification.robloxId, { rank }, interaction.user.id);

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Rank ingesteld',
            `<@${target.id}> (${verification.robloxUsername}) heeft nu rank **${rank}**.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'SET_RANK',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Rank = ${rank} door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
