// bot/commands/giveaway-end.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const { drawGiveaway } = require('../utils/giveaways');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway-end')
    .setDescription('[Management] Beëindig een lopende giveaway direct en trek winnaars')
    .addIntegerOption((opt) =>
      opt.setName('giveaway').setDescription('Welke giveaway?').setRequired(true).setAutocomplete(true)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    try {
      const { giveaways } = await api.listGuildGiveaways(interaction.guildId, 'active');
      const filtered = giveaways
        .filter((g) => g.prize.toLowerCase().includes(String(focused).toLowerCase()))
        .slice(0, 25)
        .map((g) => ({ name: `${g.prize} — eindigt <t:${Math.floor(g.endsAt / 1000)}:R>`.slice(0, 100), value: g.id }));
      await interaction.respond(filtered);
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const id = interaction.options.getInteger('giveaway', true);

    try {
      const { giveaway } = await api.getGiveaway(id);
      if (!giveaway || giveaway.guildId !== interaction.guildId) {
        await interaction.editReply({ embeds: [embeds.error('Niet gevonden', 'Deze giveaway bestaat niet (meer) in deze server.')] });
        return;
      }
      if (giveaway.status !== 'active') {
        await interaction.editReply({ embeds: [embeds.error('Al beëindigd', 'Deze giveaway is al afgelopen.')] });
        return;
      }

      const result = await drawGiveaway({ client: interaction.client, giveaway, api });
      if (result.cancelled) {
        await interaction.editReply({ embeds: [embeds.error('Kon niet beëindigen', result.reason)] });
        return;
      }

      await interaction.editReply({
        embeds: [embeds.success('Giveaway beëindigd', `Winnaar(s): ${result.winners.length ? result.winners.map((w) => `<@${w}>`).join(', ') : 'niemand deed mee'}`)],
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Beëindigen mislukt', err.message)] });
    }
  },
};
