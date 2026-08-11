// bot/commands/givecoins.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('givecoins')
    .setDescription('[Management] Geef FVR Store coins aan een speler')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addIntegerOption((opt) =>
      opt.setName('aantal').setDescription('Aantal coins').setRequired(true).setMinValue(1)
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);
    const amount = interaction.options.getInteger('aantal', true);

    try {
      const verification = await api.getVerificationByDiscordId(target.id);
      if (!verification?.verified) {
        await interaction.editReply({
          embeds: [embeds.error('Speler niet geverifieerd', `<@${target.id}> heeft geen gekoppeld Roblox account.`)],
        });
        return;
      }

      const command = await api.createCommand(
        'give_coins',
        verification.robloxId,
        { amount },
        interaction.user.id
      );

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Coins gegeven',
            `<@${target.id}> (${verification.robloxUsername}) krijgt **${amount}** FVR Coins.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'GIVE_COINS',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `${amount} coins door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
