// bot/commands/online.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('online')
    .setDescription('Bekijk de huidige serverstatus van Forever RP'),

  async execute(interaction) {
    await interaction.deferReply();

    try {
      const data = await api.getOnlineServers();
      const servers = data?.servers || [];

      const totalPlayers = servers.reduce((sum, s) => sum + s.players, 0);
      const maxPlayers = servers.reduce((sum, s) => sum + s.max_players, 0);

      await interaction.editReply({
        embeds: [embeds.serverStatus({ totalPlayers, maxPlayers, servers })],
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Ophalen mislukt', err.message)] });
    }
  },
};
