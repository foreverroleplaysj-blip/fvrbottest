// bot/commands/announce.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('announce')
    .setDescription('[Management] Stuur een aankondiging naar alle actieve Roblox servers')
    .addStringOption((opt) =>
      opt.setName('bericht').setDescription('Het bericht').setRequired(true).setMaxLength(500)
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const message = interaction.options.getString('bericht', true);

    try {
      const servers = await api.getOnlineServers();

      if (!servers?.servers?.length) {
        await interaction.editReply({
          embeds: [embeds.warning('Geen servers online', 'Er zijn momenteel geen actieve Roblox servers.')],
        });
        return;
      }

      // robloxId is not applicable — broadcast type command, targeted at "all"
      const command = await api.createCommand('announce', 'all', { message }, interaction.user.id);

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Aankondiging verstuurd',
            `Bericht verstuurd naar **${servers.servers.length}** actieve server(s):\n"${message}"\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'ANNOUNCE',
        discordId: interaction.user.id,
        details: `"${message}" naar ${servers.servers.length} server(s)`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
