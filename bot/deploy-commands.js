// bot/deploy-commands.js
// Registers all slash commands to the configured guild.
// Run with: npm run deploy

const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');
const config = require('./config');
const logger = require('./utils/logger');

const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter((file) => file.endsWith('.js'));

for (const file of commandFiles) {
  const command = require(path.join(commandsPath, file));
  if (!command?.data) {
    logger.warn(`Command bestand ${file} mist 'data' — overgeslagen.`);
    continue;
  }
  commands.push(command.data.toJSON());
}

const rest = new REST().setToken(config.discord.token);

(async () => {
  try {
    logger.info(`Registreren van ${commands.length} slash commands...`);

    const data = await rest.put(
      Routes.applicationGuildCommands(config.discord.clientId, config.discord.guildId),
      { body: commands }
    );

    logger.info(`${data.length} slash commands succesvol geregistreerd.`);
  } catch (err) {
    logger.error('Fout bij registreren van commands:', err);
    process.exit(1);
  }
})();
