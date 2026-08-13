// bot/commands/kick.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('[Management] Kick een speler uit Forever RP')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reden').setDescription('Reden voor de kick').setRequired(false).setMaxLength(500)
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);
    const reason = interaction.options.getString('reden') || 'Geen reden opgegeven';

    try {
      const verification = await api.getVerificationByDiscordId(target.id);
      if (!verification?.verified) {
        await interaction.editReply({
          embeds: [embeds.error('Speler niet geverifieerd', `<@${target.id}> heeft geen gekoppeld Roblox account.`)],
        });
        return;
      }

      const command = await api.createCommand('kick', verification.robloxId, { reason }, interaction.user.id);

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Speler gekickt',
            `<@${target.id}> (${verification.robloxUsername}) wordt gekickt.\nReden: ${reason}\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'KICK',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Reden: ${reason} — door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
