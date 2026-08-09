// bot/commands/unverify.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unverify')
    .setDescription('[Management] Verwijder de Discord ↔ Roblox koppeling van een speler')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);

    try {
      const result = await api.unverify(target.id, interaction.user.id);

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Ontkoppeld',
            `De koppeling tussen <@${target.id}> en Roblox account **${result.robloxUsername || result.robloxId}** is verwijderd.`
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'UNVERIFY',
        discordId: target.id,
        robloxId: result.robloxId,
        details: `Uitgevoerd door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({
        embeds: [embeds.error('Ontkoppelen mislukt', err.message)],
      });
    }
  },
};
