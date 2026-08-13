// bot/commands/ban.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('[Management] Ban een speler van Forever RP')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('reden').setDescription('Reden voor de ban').setRequired(true).setMaxLength(500)
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);
    const reason = interaction.options.getString('reden', true);

    try {
      const verification = await api.getVerificationByDiscordId(target.id);
      if (!verification?.verified) {
        await interaction.editReply({
          embeds: [embeds.error('Speler niet geverifieerd', `<@${target.id}> heeft geen gekoppeld Roblox account.`)],
        });
        return;
      }

      const command = await api.createCommand(
        'ban',
        verification.robloxId,
        { reason },
        interaction.user.id
      );

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Speler gebanned',
            `<@${target.id}> (${verification.robloxUsername}) is gebanned.\nReden: ${reason}\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'BAN',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Reden: ${reason} — door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
