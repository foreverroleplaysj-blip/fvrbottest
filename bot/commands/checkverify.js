// bot/commands/checkverify.js
const { SlashCommandBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');

const EMBED_DISPLAY_LIMIT = 15; // above this, send a .txt file instead

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkverify')
    .setDescription('[Staff] Bekijk alle geverifieerde Discord ↔ Roblox koppelingen'),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
      const result = await api.getAllVerifications();
      const accounts = result?.accounts || [];

      if (accounts.length === 0) {
        await interaction.editReply({
          embeds: [embeds.info('Geen geverifieerde accounts', 'Er zijn nog geen spelers geverifieerd.')],
        });
        return;
      }

      if (accounts.length <= EMBED_DISPLAY_LIMIT) {
        const lines = accounts.map(
          (a) => `<@${a.discordId}> → **${a.robloxUsername}** (\`${a.robloxId}\`) — ${new Date(a.verifiedAt).toLocaleString('nl-NL')}`
        );

        await interaction.editReply({
          embeds: [embeds.info(`Geverifieerde accounts (${accounts.length})`, lines.join('\n'))],
        });
        return;
      }

      // Too many for an embed — export as a text file instead.
      const lines = accounts.map(
        (a) =>
          `${a.discordId}\t${a.robloxUsername}\t${a.robloxId}\t${new Date(a.verifiedAt).toISOString()}`
      );
      const header = 'DiscordID\tRobloxUsername\tRobloxID\tVerifiedAt\n';
      const fileContent = header + lines.join('\n');

      const attachment = new AttachmentBuilder(Buffer.from(fileContent, 'utf-8'), {
        name: `forever-rp-verified-${Date.now()}.txt`,
      });

      await interaction.editReply({
        embeds: [
          embeds.info(
            `Geverifieerde accounts (${accounts.length})`,
            'De lijst is te groot voor een embed — zie het bijgevoegde bestand.'
          ),
        ],
        files: [attachment],
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Ophalen mislukt', err.message)] });
    }
  },
};
