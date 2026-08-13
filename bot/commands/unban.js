// bot/commands/unban.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('[Management] Unban een speler van Forever RP')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
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

      const command = await api.createCommand('unban', verification.robloxId, {}, interaction.user.id);

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Speler unbanned',
            `<@${target.id}> (${verification.robloxUsername}) is unbanned.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'UNBAN',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Uitgevoerd door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
