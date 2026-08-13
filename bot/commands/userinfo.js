// bot/commands/userinfo.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('userinfo')
    .setDescription('Bekijk verificatie-informatie van een speler')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker (standaard: jezelf)').setRequired(false)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord') || interaction.user;

    try {
      const info = await api.getVerificationByDiscordId(target.id);

      if (!info || !info.verified) {
        await interaction.editReply({
          embeds: [embeds.info('Niet geverifieerd', `<@${target.id}> heeft nog geen Roblox account gekoppeld.`)],
        });
        return;
      }

      const embed = embeds
        .info('Gebruikersinformatie')
        .addFields(
          { name: 'Discord', value: `<@${target.id}>`, inline: true },
          { name: 'Roblox username', value: info.robloxUsername || 'Onbekend', inline: true },
          { name: 'Roblox UserId', value: String(info.robloxId), inline: true },
          { name: 'Verified', value: info.verified ? 'Ja ✅' : 'Nee ❌', inline: true },
          {
            name: 'Verification date',
            value: info.verifiedAt ? new Date(info.verifiedAt).toLocaleString('nl-NL') : 'Onbekend',
            inline: true,
          }
        );

      await interaction.editReply({ embeds: [embed] });
    } catch (err) {
      await interaction.editReply({
        embeds: [embeds.error('Ophalen mislukt', err.message)],
      });
    }
  },
};
