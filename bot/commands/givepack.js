// bot/commands/givepack.js
//
// Vereist dat roblox/FVRStore.server.lua is bijgewerkt met de
// _G.FVRGivePack functie. Zonder die update valt de Roblox-kant terug
// op een basisversie (alleen de owned-vlag, geen tag/wapens/geld).

const { SlashCommandBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('givepack')
    .setDescription('[Management] Geef een volledig store-pack (tag + wapens + auto\'s + geld) aan een speler')
    .addUserOption((opt) =>
      opt.setName('discord').setDescription('De Discord gebruiker').setRequired(true)
    )
    .addStringOption((opt) =>
      opt.setName('pack').setDescription('Exacte pack naam (bv. "VIP Pakket")').setRequired(true)
    ),

  async execute(interaction, { client }) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const target = interaction.options.getUser('discord', true);
    const packName = interaction.options.getString('pack', true);

    try {
      const verification = await api.getVerificationByDiscordId(target.id);
      if (!verification?.verified) {
        await interaction.editReply({
          embeds: [embeds.error('Speler niet geverifieerd', `<@${target.id}> heeft geen gekoppeld Roblox account.`)],
        });
        return;
      }

      const command = await api.createCommand(
        'give_pack',
        verification.robloxId,
        { packName },
        interaction.user.id
      );

      await interaction.editReply({
        embeds: [
          embeds.success(
            'Pack toegekend',
            `<@${target.id}> (${verification.robloxUsername}) krijgt **${packName}** (inclusief tag, wapens, auto's en geld indien van toepassing).\nCommand ID: \`${command.id}\``
          ),
        ],
      });

      await logger.auditLog(client, {
        action: 'GIVE_PACK',
        discordId: target.id,
        robloxId: verification.robloxId,
        details: `Pack "${packName}" door <@${interaction.user.id}>`,
      });
    } catch (err) {
      await interaction.editReply({ embeds: [embeds.error('Actie mislukt', err.message)] });
    }
  },
};
