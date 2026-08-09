// bot/commands/set-money.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-money')
    .setDescription('[Management] Zet het exacte bedrag van een speler')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('bedrag').setDescription('Exact bedrag').setRequired(true).setMinValue(0)
    )
    .addStringOption((opt) =>
      opt
        .setName('rekening')
        .setDescription('Contant of Bank')
        .setRequired(true)
        .addChoices({ name: 'Contant', value: 'Contant' }, { name: 'Bank', value: 'Bank' })
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);
    const amount = interaction.options.getInteger('bedrag', true);
    const account = interaction.options.getString('rekening', true);

    if (amount > config.limits.maxMoneyAmount) {
      await interaction.editReply({
        embeds: [
          embeds.error(
            'Bedrag te hoog',
            `Het maximale bedrag per command is ${config.limits.maxMoneyAmount.toLocaleString('nl-NL')}.`
          ),
        ],
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
        'set_money',
        verification.robloxId,
        { amount, account },
        interaction.user.id
      );

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Bedrag ingesteld',
            `**${account}** van <@${target.id}> (${verification.robloxUsername}) is ingesteld op **${amount.toLocaleString('nl-NL')}**.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'SET_MONEY',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `${account} = ${amount} door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({
        embeds: [embeds.error('Actie mislukt', err.message)],
      });
    }
  },
};
