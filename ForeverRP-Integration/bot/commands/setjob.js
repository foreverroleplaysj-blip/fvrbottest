// bot/commands/setjob.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setjob')
    .setDescription('[Management] Stel de job van een speler in')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('job')
        .setDescription('De nieuwe job')
        .setRequired(true)
        .addChoices(...config.allowedJobs.map((job) => ({ name: job, value: job })))
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);
    const job = interaction.options.getString('job', true);

    if (!config.allowedJobs.includes(job)) {
      await interaction.editReply({ embeds: [embeds.error('Ongeldige job', `"${job}" staat niet op de whitelist.`)] });
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

      const command = await api.createCommand('set_job', verification.robloxId, { job }, interaction.user.id);

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Job ingesteld',
            `<@${target.id}> (${verification.robloxUsername}) heeft nu de job **${job}**.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'SET_JOB',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Job = ${job} door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
