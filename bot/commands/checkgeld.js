// bot/commands/checkgeld.js
const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('checkgeld')
    .setDescription('[Staff] Bekijk het huidige geld van een speler (Contant/Bank/Coins)')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    ),

  async execute(interaction) {
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

      const command = await api.createCommand('check_money', verification.robloxId, {}, interaction.user.id);

      // check_money is a "read-back" command — wait for Roblox to actually
      // execute it and report the real values, instead of just confirming
      // it was queued (only works while the player is online in-game).
      const result = await api.waitForCommandResult(command.id, 8000);

      if (!result) {
        await interaction.editReply({
          embeds: [
            embeds.warning(
              'Geen antwoord (nog)',
              `Command \`${command.id}\` staat in de wachtrij, maar Roblox heeft nog niet gereageerd binnen 8 seconden. Is <@${target.id}> online in-game?`
            ),
          ],
        });
        return;
      }

      if (result.status !== 'completed') {
        await interaction.editReply({
          embeds: [embeds.error('Ophalen mislukt', result.result || `Status: ${result.status}`)],
        });
        return;
      }

      await interaction.editReply({
        embeds: [
          embeds.info(
            `Geld van ${verification.robloxUsername}`,
            result.result || 'Geen data ontvangen.'
          ),
        ],
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
