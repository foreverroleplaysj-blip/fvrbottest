// bot/commands/giveaway-reroll.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const { fetchReactors, pickWinners, formatWinners } = require('../utils/giveaways');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway-reroll')
    .setDescription('[Management] Trek nieuwe winnaar(s) voor een afgelopen giveaway')
    .addIntegerOption((opt) =>
      opt.setName('giveaway').setDescription('Welke giveaway?').setRequired(true).setAutocomplete(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('aantal').setDescription('Aantal nieuwe winnaars (standaard hetzelfde als origineel)').setMinValue(1).setMaxValue(50)
    ),

  async autocomplete(interaction) {
    const focused = interaction.options.getFocused();
    try {
      const { giveaways } = await api.listGuildGiveaways(interaction.guildId, 'ended');
      const filtered = giveaways
        .filter((g) => g.prize.toLowerCase().includes(String(focused).toLowerCase()))
        .slice(0, 25)
        .map((g) => ({ name: `${g.prize} — geëindigd <t:${Math.floor(g.endedAt / 1000)}:R>`.slice(0, 100), value: g.id }));
      await interaction.respond(filtered);
    } catch {
      await interaction.respond([]);
    }
  },

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const id = interaction.options.getInteger('giveaway', true);
    const count = interaction.options.getInteger('aantal');

    try {
      const { giveaway } = await api.getGiveaway(id);
      if (!giveaway || giveaway.guildId !== interaction.guildId) {
        await interaction.editReply({ embeds: [embeds.error('Niet gevonden', 'Deze giveaway bestaat niet (meer) in deze server.')] });
        return;
      }
      if (giveaway.status !== 'ended') {
        await interaction.editReply({ embeds: [embeds.error('Nog niet afgelopen', 'Alleen een afgelopen giveaway kan opnieuw getrokken worden.')] });
        return;
      }

      const channel = await interaction.client.channels.fetch(giveaway.channelId).catch(() => null);
      const message = channel ? await channel.messages.fetch(giveaway.messageId).catch(() => null) : null;
      if (!channel || !message) {
        await interaction.editReply({ embeds: [embeds.error('Kon niet herleiden', 'Het oorspronkelijke bericht is niet meer te vinden.')] });
        return;
      }

      let reactors = await fetchReactors(message);
      if (giveaway.requiredRoleId) {
        const ids = reactors.map((u) => u.id);
        const members = ids.length ? await channel.guild.members.fetch({ user: ids }).catch(() => new Map()) : new Map();
        reactors = reactors.filter((u) => members.get(u.id)?.roles.cache.has(giveaway.requiredRoleId));
      }

      const winners = pickWinners(reactors.map((u) => u.id), count ?? giveaway.winnerCount);

      await api.rerollGiveaway(id, winners);

      await channel.send({
        content: winners.length ? winners.map((w) => `<@${w}>`).join(', ') : undefined,
        embeds: [
          embeds.custom({
            title: '🔁 Giveaway opnieuw getrokken',
            description: winners.length
              ? `Nieuwe winnaar(s) voor **${giveaway.prize}**: ${formatWinners(winners)}`
              : `Geen geldige deelnemers gevonden voor **${giveaway.prize}**.`,
            color: winners.length ? 0x10b981 : 0x6b7280,
          }),
        ],
      });

      await interaction.editReply({ embeds: [embeds.success('Opnieuw getrokken', `Nieuwe winnaar(s): ${winners.length ? winners.map((w) => `<@${w}>`).join(', ') : 'geen geldige deelnemers'}`)] });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Reroll mislukt', err.message)] });
    }
  },
};
