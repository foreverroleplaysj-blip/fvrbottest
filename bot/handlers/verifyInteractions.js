// bot/handlers/verifyInteractions.js
// One-click verify flow: player clicks a button, a small popup (modal) asks
// for their Roblox username, the bot confirms that account exists on Roblox,
// and links it — no in-game /verify CODE step needed.

const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder, MessageFlags } = require('discord.js');
const api = require('../utils/api');
const roblox = require('../utils/roblox');
const embeds = require('../utils/embeds');
const logger = require('../utils/logger');

const BUTTON_ID = 'verify_direct_button';
const MODAL_ID = 'verify_direct_modal';
const INPUT_ID = 'verify_direct_username';

function isVerifyInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === BUTTON_ID) return true;
  if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) return true;
  return false;
}

async function handleButton(interaction) {
  const existing = await api.getVerificationByDiscordId(interaction.user.id).catch(() => null);
  if (existing?.verified) {
    await interaction.reply({
      embeds: [
        embeds.info(
          'Al geverifieerd',
          `Je account is al gekoppeld aan **${existing.robloxUsername}**.`
        ),
      ],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const modal = new ModalBuilder().setCustomId(MODAL_ID).setTitle('Forever RP — Verifiëren');

  const usernameInput = new TextInputBuilder()
    .setCustomId(INPUT_ID)
    .setLabel('Jouw Roblox gebruikersnaam')
    .setStyle(TextInputStyle.Short)
    .setMinLength(3)
    .setMaxLength(32)
    .setPlaceholder('bv. JanDeVries123')
    .setRequired(true);

  modal.addComponents(new ActionRowBuilder().addComponents(usernameInput));

  await interaction.showModal(modal);
}

async function handleModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const username = interaction.fields.getTextInputValue(INPUT_ID).trim();

  try {
    const robloxUser = await roblox.findUserByUsername(username);

    if (!robloxUser) {
      await interaction.editReply({
        embeds: [
          embeds.error(
            'Roblox-account niet gevonden',
            `Er bestaat geen Roblox-account met de naam **${username}**. Controleer de spelling en probeer het opnieuw.`
          ),
        ],
      });
      return;
    }

    const result = await api.linkDirect(interaction.user.id, robloxUser.id, robloxUser.name);

    await interaction.editReply({
      embeds: [
        embeds.success(
          'Geverifieerd!',
          `Je Discord-account is nu gekoppeld aan Roblox-account **${result.robloxUsername}**.`
        ),
      ],
    });
  } catch (err) {
    await interaction.editReply({
      embeds: [embeds.error('Verifiëren mislukt', err.message)],
    });
  }
}

async function handleVerifyInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === BUTTON_ID) {
    return handleButton(interaction);
  }
  if (interaction.isModalSubmit() && interaction.customId === MODAL_ID) {
    return handleModalSubmit(interaction);
  }
}

module.exports = { isVerifyInteraction, handleVerifyInteraction, BUTTON_ID };
