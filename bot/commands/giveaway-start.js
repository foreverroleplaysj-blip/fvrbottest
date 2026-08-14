// bot/commands/giveaway-start.js
// Mirrors GiveawayBot's /gcreate: no options to fill in up front — running
// the command pops up a form (Duration, Number of Winners, Prize,
// Description). The optional channel/role stay as slash options since a
// modal can't contain a channel or role picker; they're threaded through
// to the modal handler via the modal's customId.
const { SlashCommandBuilder, ChannelType } = require('discord.js');
const { buildGiveawayModal } = require('../handlers/giveawayInteractions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway-start')
    .setDescription('[Management] Maak een giveaway aan')
    .addChannelOption((opt) =>
      opt.setName('kanaal').setDescription('Kanaal om de giveaway in te posten (standaard dit kanaal)').addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption((opt) => opt.setName('vereiste_rol').setDescription('Alleen leden met deze rol kunnen winnen')),

  async execute(interaction) {
    const channel = interaction.options.getChannel('kanaal') ?? interaction.channel;
    const requiredRole = interaction.options.getRole('vereiste_rol');

    // showModal() must be the very first response to the interaction —
    // no defer/reply before this.
    await interaction.showModal(buildGiveawayModal(channel.id, requiredRole?.id || null));
  },
};
