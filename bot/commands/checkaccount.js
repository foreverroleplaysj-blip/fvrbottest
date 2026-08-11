// bot/commands/checkaccount.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkaccount')
    .setDescription('[Staff] Bekijk Forever RP ban-geschiedenis en publieke Roblox accountinfo')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('Discord gebruiker (indien geverifieerd)').setRequired(false)
    )
    .addStringOption((opt) =>
      opt.setName('robloxid').setDescription('Of vul direct een Roblox UserId in').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord');
    const robloxIdInput = interaction.options.getString('robloxid');

    if (!target && !robloxIdInput) {
      await interaction.editReply({
        embeds: [embeds.error('Ontbrekende input', 'Geef óf een Discord gebruiker óf een Roblox UserId op.')],
      });
      return;
    }

    try {
      let robloxId = robloxIdInput;
      let robloxUsername = null;

      if (target) {
        const verification = await api.getVerificationByDiscordId(target.id);
        if (!verification?.verified) {
          await interaction.editReply({
            embeds: [embeds.error('Speler niet geverifieerd', `<@${target.id}> heeft geen gekoppeld Roblox account.`)],
          });
          return;
        }
        robloxId = verification.robloxId;
        robloxUsername = verification.robloxUsername;
      }

      if (!/^[0-9]{1,20}$/.test(robloxId)) {
        await interaction.editReply({ embeds: [embeds.error('Ongeldig Roblox UserId', 'Moet een numeriek ID zijn.')] });
        return;
      }

      const history = await api.getAccountHistory(robloxId);

      const embed = embeds.info(`Account check — ${robloxUsername || robloxId}`);
      embed.addFields({ name: 'Roblox UserId', value: robloxId, inline: true });

      if (history.robloxAccount) {
        const acc = history.robloxAccount;
        embed.addFields(
          { name: 'Roblox username', value: acc.name || 'Onbekend', inline: true },
          {
            name: 'Account aangemaakt',
            value: acc.created ? new Date(acc.created).toLocaleDateString('nl-NL') : 'Onbekend',
            inline: true,
          },
          {
            name: 'Globaal geband door Roblox',
            value: acc.isBanned ? '⚠️ Ja (account terminated)' : 'Nee',
            inline: true,
          }
        );
      } else {
        embed.addFields({ name: 'Roblox accountinfo', value: 'Kon niet worden opgehaald (Roblox API onbereikbaar of account bestaat niet).' });
      }

      if (history.bans.length === 0) {
        embed.addFields({ name: 'Forever RP ban-geschiedenis', value: 'Geen bans gevonden.' });
      } else {
        const lines = history.bans
          .slice(0, 10)
          .map(
            (b) =>
              `${b.active ? '🔴 Actief' : '⚪ Inactief'} — ${new Date(b.createdAt).toLocaleDateString('nl-NL')} — ${b.reason || 'Geen reden'}`
          );
        embed.addFields({
          name: `Forever RP ban-geschiedenis (${history.bans.length})`,
          value: lines.join('\n'),
        });
      }

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Ophalen mislukt', err.message)] });
    }
  },
};
