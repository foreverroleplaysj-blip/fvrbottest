// bot/commands/giveaway-list.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway-list')
    .setDescription('[Staff] Bekijk lopende giveaways in deze server'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const { giveaways } = await api.listGuildGiveaways(interaction.guildId, 'active');

      if (giveaways.length === 0) {
        await interaction.editReply({ embeds: [embeds.info('Geen lopende giveaways', 'Er zijn momenteel geen actieve giveaways in deze server.')] });
        return;
      }

      const description = giveaways
        .map(
          (g) =>
            `**${g.prize}** — ${g.entryCount ?? 0} deelnemer(s), ${g.winnerCount} winnaar(s), eindigt <t:${Math.floor(g.endsAt / 1000)}:R> (host: <@${g.hostId}>)`
        )
        .join('\n');

      await interaction.editReply({ embeds: [embeds.info(`Lopende giveaways (${giveaways.length})`, description)] });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Ophalen mislukt', err.message)] });
    }
  },
};
