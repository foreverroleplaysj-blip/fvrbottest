// bot/commands/giveaway-start.js
const { SlashCommandBuilder, ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');
const api = require('../utils/api');
const embeds = require('../utils/embeds');
const { GIVEAWAY_EMOJI, parseDuration, buildGiveawayEmbed } = require('../utils/giveaways');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('giveaway-start')
    .setDescription('[Management] Start een giveaway')
    .addStringOption((opt) =>
      opt.setName('prijs').setDescription('Wat wordt er weggegeven?').setRequired(true).setMaxLength(256)
    )
    .addStringOption((opt) =>
      opt
        .setName('duur')
        .setDescription('Hoe lang loopt de giveaway? (bv. 1d, 2h30m, 45m)')
        .setRequired(true)
        .setMaxLength(32)
    )
    .addIntegerOption((opt) =>
      opt.setName('winnaars').setDescription('Aantal winnaars (standaard 1)').setMinValue(1).setMaxValue(50)
    )
    .addChannelOption((opt) =>
      opt.setName('kanaal').setDescription('Kanaal om de giveaway in te posten (standaard dit kanaal)').addChannelTypes(ChannelType.GuildText)
    )
    .addRoleOption((opt) => opt.setName('vereiste_rol').setDescription('Alleen leden met deze rol kunnen winnen')),

  async execute(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    const prize = interaction.options.getString('prijs', true);
    const durationInput = interaction.options.getString('duur', true);
    const winnerCount = interaction.options.getInteger('winnaars') ?? 1;
    const channel = interaction.options.getChannel('kanaal') ?? interaction.channel;
    const requiredRole = interaction.options.getRole('vereiste_rol');

    const durationMs = parseDuration(durationInput);
    if (!durationMs) {
      await interaction.editReply({
        embeds: [embeds.error('Ongeldige duur', 'Gebruik een formaat zoals `1d`, `2h30m`, `45m` of `30s`.')],
      });
      return;
    }

    const botMember = interaction.guild.members.me;
    if (!channel.permissionsFor(botMember)?.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AddReactions])) {
      await interaction.editReply({
        embeds: [embeds.error('Geen rechten', `Ik heb "Bericht sturen" en "Reacties toevoegen" nodig in ${channel}.`)],
      });
      return;
    }

    const endsAt = Date.now() + durationMs;

    const embed = buildGiveawayEmbed({
      prize,
      winnerCount,
      hostId: interaction.user.id,
      requiredRoleId: requiredRole?.id || null,
      endsAt,
      ended: false,
    });

    const message = await channel.send({ embeds: [embed] });
    await message.react(GIVEAWAY_EMOJI);

    try {
      await api.createGiveaway({
        guildId: interaction.guildId,
        channelId: channel.id,
        messageId: message.id,
        prize,
        winnerCount,
        hostId: interaction.user.id,
        requiredRoleId: requiredRole?.id || null,
        endsAt,
      });
    } catch (err) {
      await message.delete().catch(() => {});
      await interaction.editReply({ embeds: [embeds.error('Starten mislukt', err.message)] });
      return;
    }

    await interaction.editReply({ embeds: [embeds.success('Giveaway gestart', `De giveaway voor **${prize}** loopt nu in ${channel}.`)] });
  },
};
