// bot/commands/shutdown.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('shutdown')
    .setDescription('[Management] Kondig een herstart aan en kick alle spelers na een countdown')
    .addStringOption((opt) =>
      opt.setName('bericht').setDescription('Reden/bericht (optioneel)').setRequired(false).setMaxLength(500)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('seconden')
        .setDescription('Countdown in seconden voordat spelers gekickt worden (standaard 30)')
        .setRequired(false)
        .setMinValue(0)
        .setMaxValue(300)
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const message = interaction.options.getString('bericht') || 'De server gaat binnenkort herstarten.';
    const delaySeconds = interaction.options.getInteger('seconden') ?? 30;

    try {
      const servers = await api.getOnlineServers();

      if (!servers?.servers?.length) {
        await interaction.editReply({
          embeds: [embeds.warning('Geen servers online', 'Er zijn momenteel geen actieve Roblox servers.')],
        });
        return;
      }

      const command = await api.createCommand(
        'shutdown',
        'all',
        { message, delaySeconds },
        interaction.user.id
      );

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Shutdown gepland',
            `Alle **${servers.servers.length}** actieve server(s) krijgen een aankondiging en spelers worden na **${delaySeconds}** seconden gekickt.\nBericht: "${message}"\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'SHUTDOWN',
        discordId: interaction.user.id,
        details: `"${message}" — countdown ${delaySeconds}s — ${servers.servers.length} server(s)`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
