// bot/commands/setjob.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');
const config = require('../config');
const { JOBS, isValidJob } = require('../../shared/jobs');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('setjob')
    .setDescription('[Management] Stel de job (en niveau) van een speler in')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addStringOption((opt) =>
      opt
        .setName('job')
        .setDescription('De job (typ om te zoeken)')
        .setRequired(true)
        .setAutocomplete(true)
    )
    .addIntegerOption((opt) =>
      opt
        .setName('niveau')
        .setDescription('Niveau/rang binnen deze job (1 of hoger)')
        .setRequired(true)
        .setMinValue(1)
    ),

  // Discord calls this while the user is still typing, to populate the
  // autocomplete dropdown. Must respond within 3 seconds, max 25 choices.
  async autocomplete(interaction) {
    const focused = interaction.options.getFocused().toLowerCase();

    const matches = JOBS.filter((job) => job.toLowerCase().includes(focused)).slice(0, 25);

    await interaction.respond(matches.map((job) => ({ name: job, value: job })));
  },

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);
    const job = interaction.options.getString('job', true);
    const level = interaction.options.getInteger('niveau', true);

    if (!isValidJob(job)) {
      await interaction.editReply({
        embeds: [embeds.error('Ongeldige job', `"${job}" staat niet op de whitelist. Gebruik de autocomplete-suggesties.`)],
      });
      return;
    }

    if (level > config.limits.maxJobLevel) {
      await interaction.editReply({
        embeds: [embeds.error('Niveau te hoog', `Maximaal niveau is ${config.limits.maxJobLevel}.`)],
      });
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

      const command = await api.createCommand(
        'set_job',
        verification.robloxId,
        { job, level },
        interaction.user.id
      );

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Job ingesteld',
            `<@${target.id}> (${verification.robloxUsername}) heeft nu job **${job}** op niveau **${level}**.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'SET_JOB',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Job = ${job} (niveau ${level}) door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
