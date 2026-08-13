// bot/commands/ticket-listtypes.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ticket-listtypes')
    .setDescription('[Management] Toon alle geconfigureerde ticket-types'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const { types } = await api.listTicketTypes(interaction.guildId);

      if (types.length === 0) {
        await interaction.editReply({
          embeds: [embeds.info('Geen ticket-types', 'Er zijn nog geen ticket-types toegevoegd. Gebruik `/ticket-addtype` om er een aan te maken.')],
        });
        return;
      }

      const description = types
        .map((t, i) => `**${i + 1}.** ${t.emoji ? `${t.emoji} ` : ''}${t.label} — \`${t.key}\`${t.description ? `\n   ↳ ${t.description}` : ''}`)
        .join('\n');

      await interaction.editReply({
        embeds: [embeds.info(`🎫 Ticket-types (${types.length}/25)`, description)],
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Ophalen mislukt', err.message)] });
    }
  },
};
