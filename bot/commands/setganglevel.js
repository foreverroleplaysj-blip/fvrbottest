// bot/commands/setganglevel.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setganglevel')
    .setDescription('[Management] Stel het gangniveau van een speler in')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('level').setDescription('Nieuw gangniveau').setRequired(true).setMinValue(0)
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);
    const level = interaction.options.getInteger('level', true);

    if (level > config.limits.maxGangLevel) {
      await interaction.editReply({
        embeds: [embeds.error('Level te hoog', `Maximaal gangniveau is ${config.limits.maxGangLevel}.`)],
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
        'set_gang_level',
        verification.robloxId,
        { level },
        interaction.user.id
      );

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Gangniveau ingesteld',
            `<@${target.id}> (${verification.robloxUsername}) heeft nu gangniveau **${level}**.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'SET_GANG_LEVEL',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Gang level = ${level} door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
