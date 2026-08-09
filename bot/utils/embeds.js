// bot/utils/embeds.js
// Central place for building consistent, branded embeds.

const { EmbedBuilder } = require('discord.js');
const config = require('../config');

function base() {
  return new EmbedBuilder()
    .setTimestamp()
    .setFooter({ text: 'Forever Roleplay' });
}

function success(title, description) {
  return base()
    .setColor(config.colors.success)
    .setTitle(`✅ ${title}`)
    .setDescription(description || null);
}

function error(title, description) {
  return base()
    .setColor(config.colors.error)
    .setTitle(`❌ ${title}`)
    .setDescription(description || null);
}

function info(title, description) {
  return base()
    .setColor(config.colors.info)
    .setTitle(`ℹ️ ${title}`)
    .setDescription(description || null);
}

function warning(title, description) {
  return base()
    .setColor(config.colors.warning)
    .setTitle(`⚠️ ${title}`)
    .setDescription(description || null);
}

function verification(code, expiresInMinutes) {
  return base()
    .setColor(config.colors.primary)
    .setTitle('🔐 Forever RP Verificatie')
    .setDescription(
      [
        'Je verificatiecode:',
        '',
        `**${code}**`,
        '',
        'Ga vervolgens naar Forever RP en voer uit:',
        `\`/verify ${code}\``,
        '',
        `Deze code is ${expiresInMinutes} minuten geldig en eenmalig bruikbaar.`,
      ].join('\n')
    );
}

function audit({ action, discordId, robloxId, details }) {
  return base()
    .setColor(config.colors.primary)
    .setTitle(`📝 Audit Log — ${action}`)
    .addFields(
      { name: 'Discord', value: discordId ? `<@${discordId}>` : 'N/A', inline: true },
      { name: 'Roblox ID', value: robloxId ? String(robloxId) : 'N/A', inline: true },
      { name: 'Details', value: details || 'Geen extra details' }
    );
}

function serverStatus({ totalPlayers, maxPlayers, servers }) {
  const embed = base()
    .setColor(config.colors.primary)
    .setTitle('🟢 Forever RP')
    .addFields(
      { name: 'Players', value: `${totalPlayers}/${maxPlayers}`, inline: true },
      { name: 'Servers', value: `${servers.length}`, inline: true },
      { name: 'Status', value: servers.length > 0 ? 'Online' : 'Offline', inline: true }
    );

  if (servers.length > 0) {
    embed.addFields({
      name: 'Server details',
      value: servers
        .map((s) => `\`${s.job_id.slice(0, 8)}...\` — ${s.players}/${s.max_players} spelers`)
        .join('\n'),
    });
  }

  return embed;
}

module.exports = {
  success,
  error,
  info,
  warning,
  verification,
  audit,
  serverStatus,
};
