// bot/utils/giveaways.js
// Shared helpers for the classic reaction-based giveaway system (🎉, same
// spirit as GiveawayBot) — used by the slash commands and the scheduler.

const embeds = require('./embeds');
const logger = require('./logger');

const GIVEAWAY_EMOJI = '🎉';

const DURATION_RE = /(\d+)\s*(w|d|h|m|s)/gi;
const UNIT_MS = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 };

/**
 * Parses a compact duration string like "1d", "2h30m", "45s" into
 * milliseconds. Returns null if nothing valid could be parsed.
 */
function parseDuration(input) {
  if (!input || typeof input !== 'string') return null;
  let total = 0;
  let matched = false;

  for (const match of input.matchAll(DURATION_RE)) {
    matched = true;
    const amount = Number(match[1]);
    const unit = match[2].toLowerCase();
    total += amount * UNIT_MS[unit];
  }

  if (!matched || total <= 0) return null;
  return total;
}

/** Random, no-repeat pick of `count` winners from a pool of user IDs. */
function pickWinners(pool, count) {
  const unique = [...new Set(pool)];
  const shuffled = unique.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.max(0, count));
}

function formatWinners(winnerIds) {
  if (!winnerIds || winnerIds.length === 0) return 'Niemand deed mee — geen winnaar.';
  return winnerIds.map((id) => `<@${id}>`).join(', ');
}

/**
 * Builds the giveaway embed, for both the still-running and the
 * already-ended state.
 */
function buildGiveawayEmbed({ prize, winnerCount, hostId, requiredRoleId, endsAt, ended, winners }) {
  const lines = [
    `Reageer met ${GIVEAWAY_EMOJI} om mee te doen!`,
    '',
    `**Winnaars:** ${winnerCount}`,
    `**Host:** <@${hostId}>`,
  ];
  if (requiredRoleId) lines.push(`**Vereist:** <@&${requiredRoleId}>`);
  lines.push(ended ? `**Geëindigd:** <t:${Math.floor(endsAt / 1000)}:R>` : `**Eindigt:** <t:${Math.floor(endsAt / 1000)}:R>`);

  if (ended) {
    lines.push('', `**Winnaar(s):** ${formatWinners(winners)}`);
  }

  const embed = embeds.custom({
    title: `${ended ? '🎉 Giveaway geëindigd' : '🎉 Giveaway'} — ${prize}`,
    description: lines.join('\n'),
    color: ended ? 0x6b7280 : 0xf59e0b,
  });

  return embed;
}

/**
 * Pages through every user who reacted with the giveaway emoji on a
 * message, via plain REST calls (no gateway reaction intent needed).
 * Bots are excluded, since the bot's own entry reaction shouldn't count.
 */
async function fetchReactors(message) {
  const reaction = message.reactions.cache.get(GIVEAWAY_EMOJI);
  if (!reaction) return [];

  const users = [];
  let after;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = await reaction.users.fetch({ limit: 100, after });
    if (batch.size === 0) break;
    users.push(...batch.values());
    after = batch.last().id;
    if (batch.size < 100) break;
  }

  return users.filter((u) => !u.bot);
}

/**
 * Draws winners for a giveaway: fetches the message, pulls current
 * reactors, applies the required-role filter (if any), picks winners,
 * edits the embed to its "ended" state, announces in-channel, and
 * persists the result via the API. Shared by /giveaway-end and the
 * auto-end scheduler so both behave identically.
 */
async function drawGiveaway({ client, giveaway, api }) {
  const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
  if (!channel) {
    await api.cancelGiveaway(giveaway.id).catch(() => {});
    return { cancelled: true, reason: 'Kanaal niet gevonden' };
  }

  const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
  if (!message) {
    await api.cancelGiveaway(giveaway.id).catch(() => {});
    return { cancelled: true, reason: 'Bericht niet gevonden' };
  }

  let reactors = await fetchReactors(message);

  if (giveaway.requiredRoleId) {
    const guild = channel.guild;
    const ids = reactors.map((u) => u.id);
    const members = ids.length ? await guild.members.fetch({ user: ids }).catch(() => new Map()) : new Map();
    reactors = reactors.filter((u) => members.get(u.id)?.roles.cache.has(giveaway.requiredRoleId));
  }

  const winners = pickWinners(reactors.map((u) => u.id), giveaway.winnerCount);

  const endedEmbed = buildGiveawayEmbed({
    prize: giveaway.prize,
    winnerCount: giveaway.winnerCount,
    hostId: giveaway.hostId,
    requiredRoleId: giveaway.requiredRoleId,
    endsAt: giveaway.endsAt,
    ended: true,
    winners,
  });

  await message.edit({ embeds: [endedEmbed] }).catch(() => {});

  await channel
    .send({
      content: winners.length ? winners.map((id) => `<@${id}>`).join(', ') : undefined,
      embeds: [
        embeds.custom({
          title: winners.length ? `🎉 Gefeliciteerd!` : 'Giveaway geëindigd',
          description: winners.length
            ? `${formatWinners(winners)} heeft/hebben **${giveaway.prize}** gewonnen!`
            : `Niemand heeft meegedaan aan de giveaway voor **${giveaway.prize}**.`,
          color: winners.length ? 0x10b981 : 0x6b7280,
        }),
      ],
    })
    .catch((err) => logger.warn(`Kon giveaway-aankondiging niet versturen: ${err.message}`));

  await api.endGiveaway(giveaway.id, winners);

  return { cancelled: false, winners };
}

module.exports = {
  GIVEAWAY_EMOJI,
  parseDuration,
  pickWinners,
  formatWinners,
  buildGiveawayEmbed,
  fetchReactors,
  drawGiveaway,
};
