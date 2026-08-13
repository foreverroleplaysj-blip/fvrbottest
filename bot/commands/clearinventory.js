// bot/commands/clearinventory.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('clearinventory')
    .setDescription('[Management] Maak de Ox inventory van een speler leeg')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);

    try {
      const verification = await api.getVerificationByDiscordId(target.id);
      if (!verification?.verified) {
        await interaction.editReply({
          embeds: [embeds.error('Speler niet geverifieerd', `<@${target.id}> heeft geen gekoppeld Roblox account.`)],
        });
        return;
      }

      const command = await api.createCommand('clear_inventory', verification.robloxId, {}, interaction.user.id);

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Inventory geleegd',
            `De inventory van <@${target.id}> (${verification.robloxUsername}) wordt geleegd.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'CLEAR_INVENTORY',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
