// bot/index.js
// Main Discord bot entry point.

const fs = require('fs');
const path = require('path');

const {
  Client,
  GatewayIntentBits,
  Collection,
  MessageFlags,
} = require('discord.js');

const config = require('./config');
const permissions = require('./utils/permissions');
const embeds = require('./utils/embeds');
const logger = require('./utils/logger');
const ticketInteractions = require('./ticketInteractions');

const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.commands = new Collection();

// ---- Load commands ----

const commandsPath = path.join(__dirname, 'commands');

const commandFiles = fs
  .readdirSync(commandsPath)
  .filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(
    path.join(commandsPath, file)
  );

  if (!command?.data || !command?.execute) {
    logger.warn(
      `Command bestand ${file} mist 'data' of 'execute' — overgeslagen.`
    );

    continue;
  }

  client.commands.set(
    command.data.name,
    command
  );
}

logger.info(
  `${client.commands.size} commands geladen.`
);

// ---- Ready ----

client.once('ready', () => {
  logger.info(
    `Ingelogd als ${client.user.tag}`
  );

  client.user.setActivity(
    'Forever Roleplay'
  );
});

// ---- Interaction handling ----

client.on(
  'interactionCreate',
  async (interaction) => {

    // ==========================================
    // TICKET INTERACTIONS
    // ==========================================

    if (
      ticketInteractions.isTicketInteraction(
        interaction
      )
    ) {
      try {

        // Ticket buttons
        if (interaction.isButton()) {
          await ticketInteractions.handleButton(
            interaction
          );

          return;
        }

        // Ticket select menus
        if (interaction.isStringSelectMenu()) {
          await ticketInteractions.handleSelectMenu(
            interaction
          );

          return;
        }

        // Ticket modals
        if (interaction.isModalSubmit()) {
          await ticketInteractions.handleModalSubmit(
            interaction
          );

          return;
        }

      } catch (err) {
        logger.error(
          'Fout bij ticket interaction:',
          err
        );

        const errorEmbed = embeds.error(
          'Er ging iets mis',
          'Er is een fout opgetreden bij het verwerken van deze ticketactie.'
        );

        if (
          interaction.replied ||
          interaction.deferred
        ) {
          await interaction
            .followUp({
              embeds: [errorEmbed],
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        } else {
          await interaction
            .reply({
              embeds: [errorEmbed],
              flags: MessageFlags.Ephemeral,
            })
            .catch(() => {});
        }
      }

      return;
    }

    // ==========================================
    // AUTOCOMPLETE
    // ==========================================

    if (interaction.isAutocomplete()) {
      const command =
        client.commands.get(
          interaction.commandName
        );

      if (!command?.autocomplete) return;

      try {
        await command.autocomplete(
          interaction
        );
      } catch (err) {
        logger.error(
          `Fout bij autocomplete van /${interaction.commandName}:`,
          err
        );
      }

      return;
    }

    // ==========================================
    // SLASH COMMANDS
    // ==========================================

    if (!interaction.isChatInputCommand()) {
      return;
    }

    const command =
      client.commands.get(
        interaction.commandName
      );

    if (!command) {
      logger.warn(
        `Onbekend command aangeroepen: ${interaction.commandName}`
      );

      return;
    }

    // Centralized permission check

    if (
      !permissions.canRunCommand(
        interaction,
        interaction.commandName
      )
    ) {
      await interaction.reply({
        embeds: [
          embeds.error(
            'Geen toegang',
            'Je hebt geen toestemming om dit command te gebruiken.'
          ),
        ],
        flags: MessageFlags.Ephemeral,
      });

      return;
    }

    try {
      await command.execute(
        interaction,
        {
          client,
          config,
          logger,
        }
      );
    } catch (err) {
      logger.error(
        `Fout bij uitvoeren van /${interaction.commandName}:`,
        err
      );

      const errorEmbed = embeds.error(
        'Er ging iets mis',
        'Er is een onverwachte fout opgetreden bij het uitvoeren van dit command. Probeer het later opnieuw.'
      );

      if (
        interaction.replied ||
        interaction.deferred
      ) {
        await interaction
          .followUp({
            embeds: [errorEmbed],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      } else {
        await interaction
          .reply({
            embeds: [errorEmbed],
            flags: MessageFlags.Ephemeral,
          })
          .catch(() => {});
      }
    }
  }
);

// ---- Discord errors ----

client.on(
  'error',
  (err) =>
    logger.error(
      'Discord client error:',
      err
    )
);

process.on(
  'unhandledRejection',
  (err) =>
    logger.error(
      'Unhandled promise rejection:',
      err
    )
);

// ---- Login ----

client.login(
  config.discord.token
);