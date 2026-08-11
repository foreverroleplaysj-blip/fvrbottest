// bot/commands/revive.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('revive')
    .setDescription('[Management] Revive een speler op hun laatst bekende positie')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker om te reviven').setRequired(true)
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);

    try {
      const verification = await api.getVerificationByDiscordId(target.id);
      if (!verification?.verified) {
        await interaction.editReply({
          embeds: [embeds.error('Speler niet geverifieerd', `<@${target.id}> heeft geen gekoppeld Roblox account.`)],
        });
        return;
      }

      const command = await api.createCommand('revive', verification.robloxId, {}, interaction.user.id);

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Revive verzonden',
            `<@${target.id}> (${verification.robloxUsername}) wordt gerevived zodra de command wordt opgepikt.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'REVIVE',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Revive uitgevoerd door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
