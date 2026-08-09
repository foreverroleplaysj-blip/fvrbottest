// bot/commands/setgang.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setgang')
    .setDescription('[Management] Stel de gang van een speler in')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('gang')
        .setDescription('Gang code')
        .setRequired(true)
        .addChoices(
          ...Object.entries(config.allowedGangs).map(([code, data]) => ({
            name: `${code} — ${data.name}`,
            value: code,
          }))
        )
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);
    const gang = interaction.options.getString('gang', true);

    if (!config.allowedGangs[gang]) {
      await interaction.editReply({ embeds: [embeds.error('Ongeldige gang', `"${gang}" staat niet op de whitelist.`)] });
      return;
    }

    try {
      const verification = await api.getVerificationByDiscordId(target.id);
      if (!verification?.verified) {
        await interaction.editReply({
          embeds: [embeds.error('Speler niet geverifieerd', `<@${target.id}> heeft geen gekoppeld Roblox account.`)],
        });
        return;
      }

      const command = await api.createCommand('set_gang', verification.robloxId, { gang }, interaction.user.id);

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Gang ingesteld',
            `<@${target.id}> (${verification.robloxUsername}) zit nu bij **${config.allowedGangs[gang].name} (${gang})**.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'SET_GANG',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Gang = ${gang} door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
