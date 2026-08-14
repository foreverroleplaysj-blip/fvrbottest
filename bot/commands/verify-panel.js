// bot/commands/verify-panel.js
const {
  SlashCommandBuilder,
  ChannelType,
  MessageFlags,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
} = require('discord.js');
const embeds = require('../utils/embeds');
const { BUTTON_ID } = require('../handlers/verifyInteractions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('verify-panel')
    .setDescription('[Management] Verstuur het verificatie-paneel (knop) in een kanaal')
    .addChannelOption((opt) =>
      opt
        .setName('kanaal')
        .setDescription('Kanaal waar het paneel geplaatst wordt')
        .addChannelTypes(ChannelType.GuildText)
        .setRequired(true)
    ),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const channel = interaction.options.getChannel('kanaal', true);

    const panelEmbed = embeds.custom({
      title: '🔐 Koppel je Roblox-account',
      description: [
        'Klik op de knop hieronder en vul je Roblox gebruikersnaam in.',
        'Geen code, geen in-game commando nodig — je account wordt direct gekoppeld.',
      ].join('\n'),
    });

    const button = new ButtonBuilder()
      .setCustomId(BUTTON_ID)
      .setLabel('Verifiëren')
      .setEmoji('🔐')
      .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(button);

    await channel.send({ embeds: [panelEmbed], components: [row] });

    await interaction.editReply({
      embeds: [embeds.success('Paneel verstuurd', `Het verificatie-paneel staat nu in ${channel}.`)],
    });
  },
};
