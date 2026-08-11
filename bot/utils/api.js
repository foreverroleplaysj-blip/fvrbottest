// bot/utils/api.js
// Thin HTTP client the bot uses to talk to the Forever RP API.
// Every request is authenticated with X-API-Key.

const config = require('../config');

class ApiError extends Error {
  constructor(message, status, body) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.body = body;
  }
}

async function request(method, path, body) {
  const url = `${config.api.baseUrl}${path}`;

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': config.api.key,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (err) {
    throw new ApiError(`Kon geen verbinding maken met de API (${url}): ${err.message}`, 0, null);
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text };
    }
  }

  if (!response.ok) {
    const message = (data && data.error) || `API request failed with status ${response.status}`;
    throw new ApiError(message, response.status, data);
  }

  return data;
}

const api = {
  ApiError,

  // ---- Verification ----
  createVerification: (discordId) =>
    request('POST', '/verification/create', { discordId }),

  getVerificationByDiscordId: (discordId) =>
    request('GET', `/verification/${discordId}`),

  getAllVerifications: () => request('GET', '/verification/list'),

  unverify: (discordId, actorDiscordId) =>
    request('POST', '/verification/unverify', { discordId, actorDiscordId }),

  // ---- Commands (generic queue) ----
  createCommand: (type, robloxId, payload, createdBy) =>
    request('POST', '/commands/create', { type, robloxId, payload, createdBy }),

  getCommand: (id) => request('GET', `/commands/${id}`),

  cancelCommand: (id, actorDiscordId) =>
    request('POST', '/commands/cancel', { id, actorDiscordId }),

  // ---- Servers ----
  getOnlineServers: () => request('GET', '/servers/online'),

  // ---- Players ----
  getAccountHistory: (robloxId) => request('GET', `/players/${robloxId}/history`),

  /**
   * Poll a command until it reaches a terminal status (completed/failed/expired)
   * or the timeout is hit. Used for "read-back" commands like /checkgeld where
   * the reply needs the actual result Roblox sends back, not just "queued".
   */
  async waitForCommandResult(id, timeoutMs = 8000, intervalMs = 700) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const command = await api.getCommand(id);
      if (['completed', 'failed', 'expired'].includes(command.status)) {
        return command;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    return null; // timed out, still pending/processing
  },
};

module.exports = api;
