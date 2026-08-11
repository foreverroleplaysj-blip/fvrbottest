// bot/commands/checkaccount.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkaccount')
    .setDescription('[Staff] Check ban-status van een Roblox account (eigen server + Roblox platform)')
    .addStringOption((opt) =>
      opt.setName('roblox_id').setDescription('Het Roblox User ID om te checken').setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const robloxId = interaction.options.getString('roblox_id', true).trim();

    if (!/^[0-9]{1,20}$/.test(robloxId)) {
      await interaction.editReply({
        embeds: [embeds.error('Ongeldig ID', 'Geef een numeriek Roblox User ID op (gebruik `/userinfo` als je alleen de naam weet).')],
      });
      return;
    }

    try {
      const result = await api.getFullAccountCheck(robloxId);

      const lines = [];

      lines.push(`**Roblox account:** ${result.roblox ? `${result.roblox.name} (${robloxId})` : `Onbekend (${robloxId})`}`);

      if (result.platformTerminated === true) {
        lines.push('🚫 **Platform-status:** Dit account is door Roblox zelf getermineerd (platform-brede ban).');
      } else if (result.platformTerminated === false) {
        lines.push('✅ **Platform-status:** Niet platform-breed geband door Roblox.');
      } else {
        lines.push('❔ **Platform-status:** Kon niet worden opgehaald (Roblox API niet bereikbaar of account bestaat niet meer).');
      }

      lines.push('');
      lines.push(
        result.ownServer.currentlyBanned
          ? `🚫 **Onze server:** Actief gebanned — reden: ${result.ownServer.activeBan.reason || 'geen reden opgegeven'}`
          : '✅ **Onze server:** Niet actief gebanned.'
      );

      if (result.ownServer.history.length > 0) {
        lines.push('');
        lines.push('**Ban-geschiedenis (onze server):**');
        for (const entry of result.ownServer.history.slice(0, 5)) {
          const date = new Date(entry.createdAt).toLocaleDateString('nl-NL');
          lines.push(`- ${date} — ${entry.reason || 'geen reden'} ${entry.active ? '(actief)' : '(opgeheven)'}`);
        }
      }

      lines.push('');
      lines.push('*Let op: Roblox biedt geen publieke data over bans in andere games — alleen platform-brede terminatie en onze eigen server-bans kunnen gecheckt worden.*');

      const embed = (result.ownServer.currentlyBanned || result.platformTerminated
        ? embeds.warning
        : embeds.success)('Account Check', lines.join('\n'));

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
