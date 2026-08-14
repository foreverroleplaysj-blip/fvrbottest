// bot/index.js
// Main Discord bot entry point.

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Collection, MessageFlags } = require('discord.js');
const config = require('./config');
const permissions = require('./utils/permissions');
const embeds = require('./utils/embeds');
const logger = require('./utils/logger');
const ticketInteractions = require('./handlers/ticketInteractions');
const giveawayInteractions = require('./handlers/giveawayInteractions');
const api = require('./utils/api');
const { startGiveawayScheduler } = require('./giveawayScheduler');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

// ---- Load commands ----
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (!command?.data || !command?.execute) {
    logger.warn(`Command bestand ${file} mist 'data' of 'execute' — overgeslagen.`);
    continue;
  }
  client.commands.set(command.data.name, command);
}

logger.info(`${client.commands.size} commands geladen.`);

// ---- Ready ----
client.once('ready', async () => {
  logger.info(`Ingelogd als ${client.user.tag}`);
  client.user.setActivity('Forever Roleplay');

  // Reports every server the bot is currently in to the API, so the
  // dashboard's "kies een server" screen (after Discord login) knows
  // where the bot actually is. Non-fatal if it fails — the bot itself
  // keeps working either way.
  try {
    const guilds = client.guilds.cache.map((g) => ({ id: g.id, name: g.name, icon: g.iconURL() || null }));
    await api.syncDiscordGuilds(guilds);
    logger.info(`${guilds.length} servers gesynchroniseerd met de API voor het dashboard.`);
  } catch (err) {
    logger.error('Kon serverlijst niet synchroniseren met de API:', err);
  }

  startGiveawayScheduler(client);
});

// Keeps the dashboard's server list live as the bot is added to / removed
// from servers, without waiting for the next restart.
client.on('guildCreate', async (guild) => {
  try {
    await api.upsertDiscordGuild(guild.id, guild.name, guild.iconURL() || null);
  } catch (err) {
    logger.error(`Kon nieuwe server ${guild.id} niet synchroniseren met de API:`, err);
  }
});

client.on('guildDelete', async (guild) => {
  try {
    await api.removeDiscordGuild(guild.id);
  } catch (err) {
    logger.error(`Kon verwijderde server ${guild.id} niet uit de API halen:`, err);
  }
});

// ---- Interaction handling ----
client.on('interactionCreate', async (interaction) => {
  if (interaction.isAutocomplete()) {
    const command = client.commands.get(interaction.commandName);
    if (!command?.autocomplete) return;

    try {
      await command.autocomplete(interaction);
    } catch (err) {
      logger.error(`Fout bij autocomplete van /${interaction.commandName}:`, err);
    }
    return;
  }

  if (ticketInteractions.isTicketInteraction(interaction)) {
    try {
      await ticketInteractions.handleTicketInteraction(interaction);
    } catch (err) {
      logger.error('Fout bij ticket interactie:', err);
    }
    return;
  }

  if (giveawayInteractions.isGiveawayInteraction(interaction)) {
    try {
      await giveawayInteractions.handleGiveawayInteraction(interaction);
    } catch (err) {
      logger.error('Fout bij giveaway interactie:', err);
    }
    return;
  }

  if (!interaction.isChatInputCommand()) return;

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.warn(`Onbekend command aangeroepen: ${interaction.commandName}`);
    return;
  }

  // Centralized permission check
  if (!permissions.canRunCommand(interaction, interaction.commandName)) {
    await interaction.reply({
      embeds: [embeds.error('Geen toegang', 'Je hebt geen toestemming om dit command te gebruiken.')],
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  try {
    await command.execute(interaction, { client, config, logger });
  } catch (err) {
    logger.error(`Fout bij uitvoeren van /${interaction.commandName}:`, err);

    const errorEmbed = embeds.error(
      'Er ging iets mis',
      'Er is een onverwachte fout opgetreden bij het uitvoeren van dit command. Probeer het later opnieuw.'
    );

    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
    } else {
      await interaction.reply({ embeds: [errorEmbed], flags: MessageFlags.Ephemeral }).catch(() => {});
    }
  }
});

client.on('error', (err) => logger.error('Discord client error:', err));
process.on('unhandledRejection', (err) => logger.error('Unhandled promise rejection:', err));

client.login(config.discord.token);
