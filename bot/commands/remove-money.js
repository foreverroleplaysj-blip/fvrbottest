// bot/commands/remove-money.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('remove-money')
    .setDescription('[Management] Verwijder geld van een speler')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('bedrag').setDescription('Bedrag om te verwijderen').setRequired(true).setMinValue(1)
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
        'remove_money',
        verification.robloxId,
        { amount, account },
        interaction.user.id
      );

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Geld verwijderd',
            `**${amount.toLocaleString('nl-NL')}** verwijderd van **${account}** van <@${target.id}> (${verification.robloxUsername}).\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'REMOVE_MONEY',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `-${amount} van ${account} door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({
        embeds: [embeds.error('Actie mislukt', err.message)],
      });
    }
  },
};
