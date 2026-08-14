// bot/utils/roblox.js
// Small wrapper around Roblox's public (no-auth) API — just enough to turn
// a username into a real, existing account before we let someone link it.

const USERS_API = 'https://users.roblox.com/v1/usernames/users';

/**
 * Look up a Roblox account by exact username.
 * @param {string} username
 * @returns {Promise<{ id: number, name: string, displayName: string } | null>}
 *   null if no account with that exact username exists (or the lookup failed).
 */
async function findUserByUsername(username) {
  let response;
  try {
    response = await fetch(USERS_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ usernames: [username], excludeBannedUsers: false }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  let data;
  try {
    data = await response.json();
  } catch {
    return null;
  }

  const match = data?.data?.[0];
  if (!match) return null;

  return { id: match.id, name: match.name, displayName: match.displayName };
}

module.exports = { findUserByUsername };
