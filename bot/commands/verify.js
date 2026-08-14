// bot/commands/verify.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify')
    .setDescription('Genereer een verificatiecode om je Discord aan je Roblox account te koppelen'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const existing = await api.getVerificationByDiscordId(interaction.user.id).catch(() => null);
      if (existing?.verified) {
        await interaction.editReply({
          embeds: [
            embeds.info(
              'Al geverifieerd',
              `Je account is al gekoppeld aan **${existing.robloxUsername}**. Gebruik \`/unverify\` (management) om dit te ontkoppelen.`
            ),
          ],
        });
        return;
      }

      const result = await api.createVerification(interaction.user.id);

      await interaction.editReply({
        embeds: [embeds.verification(result.code, result.expiresInMinutes)],
      });
    } catch (err) {
      await interaction.editReply({
        embeds: [embeds.error('Verificatie mislukt', err.message)],
      });
    }
  },
};
