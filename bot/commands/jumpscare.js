// bot/commands/jumpscare.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('jumpscare')
    .setDescription('[Management] Stuur een jumpscare (beeld + geluid) naar een speler')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker om te laten schrikken').setRequired(true)
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

      const command = await api.createCommand('jumpscare', verification.robloxId, {}, interaction.user.id);

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Jumpscare verzonden',
            `<@${target.id}> (${verification.robloxUsername}) krijgt een jumpscare zodra de command wordt opgepikt.\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'JUMPSCARE',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Jumpscare uitgevoerd door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
