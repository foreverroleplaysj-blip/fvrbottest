# Forever RP — Discord ↔ Roblox Integratie

Complete integratie tussen je Discord server en Forever Roleplay (Roblox), geïnspireerd op hoe Parcel werkt.

```
Discord → Discord Bot → Forever RP API (Node.js/Express + SQLite) → Roblox (HTTP polling)
```

---

## 📁 Projectstructuur

```
ForeverRP-Integration/
├── bot/            Discord bot (discord.js v14)
├── api/            Node.js/Express API + SQLite database
├── roblox/         ForeverIntegration.server.lua
├── data/           SQLite database bestand (aangemaakt bij eerste start)
├── .env.example
└── package.json
```

---

## 1. Node.js installeren

Download en installeer [Node.js LTS](https://nodejs.org/) (versie 18 of hoger). Controleer in PowerShell:

```powershell
node -v
npm -v
```

## 2. Project downloaden

Pak het project uit of clone het naar een map, bijvoorbeeld:

```powershell
cd C:\Projects
git clone <jouw-repo-url> ForeverRP-Integration
cd ForeverRP-Integration
```

## 3. Dependencies installeren

```powershell
npm install
```

Dit installeert `discord.js`, `express`, `better-sqlite3`, `dotenv`, `helmet` en `express-rate-limit`.

> Als `better-sqlite3` een build-fout geeft op Windows, installeer de Visual Studio Build Tools ("Desktop development with C++") en probeer opnieuw.

## 4. `.env` aanmaken

Kopieer het voorbeeldbestand:

```powershell
copy .env.example .env
```

Open `.env` en vul in:

```env
DISCORD_TOKEN=jouw-bot-token
DISCORD_CLIENT_ID=jouw-applicatie-id
DISCORD_GUILD_ID=jouw-server-id

API_BASE_URL=http://localhost:3000
API_KEY=een-lange-willekeurige-geheime-string
API_PORT=3000

DATABASE_PATH=./data/foreverrp.sqlite

STAFF_ROLE_ID=discord-role-id-van-staff
MANAGEMENT_ROLE_ID=discord-role-id-van-management
AUDIT_LOG_CHANNEL_ID=discord-channel-id-voor-audit-logs
```

Genereer een sterke `API_KEY`, bijvoorbeeld in PowerShell:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 5. Discord Developer Portal instellen

1. Ga naar https://discord.com/developers/applications
2. **New Application** → geef een naam (bv. "Forever RP")
3. Ga naar **Bot** → **Add Bot**
4. Kopieer de **Token** → dit is je `DISCORD_TOKEN`
5. Ga naar **OAuth2 → General** → kopieer **Client ID** → dit is je `DISCORD_CLIENT_ID`
6. Rechtsklik je Discord server (met Developer Mode aan) → **Copy Server ID** → dit is je `DISCORD_GUILD_ID`

## 6. Bot permissions

Ga naar **OAuth2 → URL Generator**:

- Scopes: `bot`, `applications.commands`
- Bot permissions: `Send Messages`, `Embed Links`, `Use Slash Commands`, `Kick Members` (optioneel, alleen als je wilt dat de bot ook Discord-acties uitvoert)

Open de gegenereerde URL en nodig de bot uit op je server.

## 7. Slash commands registreren

```powershell
npm run deploy
```

Je zou moeten zien: `14 slash commands succesvol geregistreerd.`

## 8. API starten

Open een **eerste** PowerShell-venster:

```powershell
npm run api
```

Je ziet: `[API] Forever RP API luistert op poort 3000`

De database (`data/foreverrp.sqlite`) wordt automatisch aangemaakt met alle tabellen.

## 9. Bot starten

Open een **tweede** PowerShell-venster:

```powershell
npm start
```

Je ziet: `Ingelogd als JouwBot#1234`

## 10. Roblox HTTP Requests inschakelen

In Roblox Studio:

1. Open je Forever RP place
2. Ga naar **Home → Game Settings → Security**
3. Zet **Allow HTTP Requests** aan
4. Sla op

## 11. Roblox script installeren

1. Kopieer `roblox/ForeverIntegration.server.lua`
2. Plaats het als een **Script** (geen LocalScript!) in **ServerScriptService**
3. Open het script en vul bovenaan in:

```lua
local Config = {
    API_URL = "https://jouw-api-domein.com", -- of ngrok-URL tijdens testen
    API_KEY = "dezelfde-key-als-in-.env",
    ...
}
```

> **Let op:** tijdens lokaal testen is `localhost` niet bereikbaar vanuit Roblox. Gebruik een tool zoals [ngrok](https://ngrok.com/) om je lokale API tijdelijk publiek bereikbaar te maken: `ngrok http 3000`, en gebruik de `https://...ngrok-free.app` URL als `API_URL`.

## 12. API-key instellen

Zorg dat de `API_KEY` in `roblox/ForeverIntegration.server.lua` **exact** overeenkomt met `API_KEY` in je `.env`. Zonder deze match krijg je overal `401 Unauthorized`.

## 13. `/verify` testen

1. Typ in Discord: `/verify`
2. Je krijgt een code zoals `FVR-A7B32C`
3. Ga in-game naar de Roblox chat en typ: `/verify FVR-A7B32C`
4. Typ in Discord `/userinfo` om te bevestigen dat de koppeling gelukt is

## 14. `/online` testen

Typ `/online` in Discord. Je zou de huidige spelers en serverstatus moeten zien zodra de Roblox-server minstens 1 heartbeat heeft gestuurd (max. 5 seconden na opstarten).

## 15. `/give-money` testen

```
/give-money discord:@JezelfOfTester bedrag:5000 rekening:Bank
```

Controleer in-game of de `Bank`-waarde van de speler is aangepast (kan tot 3 seconden duren door de polling-interval).

## 16. `/setjob` testen

```
/setjob discord:@Speler job:Politie
```

## 17. `/setrank` testen

```
/setrank discord:@Speler rank:5
```

## 18. `/ban` testen

```
/ban discord:@Speler reden:Test
```

De speler wordt gekickt met de opgegeven reden. Bij een nieuwe join-poging wordt de speler direct geweerd (via `IsBanned` check).

## 19. Productiehosting

Voor productie:

- Host de API op een VPS (bv. via [Hetzner](https://www.hetzner.com/), [DigitalOcean](https://www.digitalocean.com/), of een ander platform naar keuze)
- Gebruik een process manager zoals [PM2](https://pm2.keymetrics.io/) om de bot en API 24/7 te laten draaien:

```powershell
npm install -g pm2
pm2 start api/server.js --name foreverrp-api
pm2 start bot/index.js --name foreverrp-bot
pm2 save
```

## 20. HTTPS

Roblox `HttpService` vereist HTTPS in productie. Gebruik bijvoorbeeld:

- [Caddy](https://caddyserver.com/) of [nginx](https://nginx.org/) als reverse proxy met een gratis Let's Encrypt certificaat
- Of een managed platform dat automatisch HTTPS regelt

Zorg dat `API_URL` in het Roblox script en `API_BASE_URL` in `.env` de `https://` URL gebruiken.

## 21. Security

- **Nooit** je `.env` bestand committen naar Git (staat al in `.gitignore`)
- Roteer je `API_KEY` als je vermoedt dat deze gelekt is
- Zet `Allow HTTP Requests` alleen aan, gebruik geen andere onveilige Studio-instellingen
- Gebruik een sterke, unieke `API_KEY` (minimaal 32 random bytes, zie stap 4)
- Beperk toegang tot je API-server met een firewall waar mogelijk (alleen Roblox' IP-ranges en jouw eigen server, indien haalbaar)
- Controleer regelmatig de `audit_logs` tabel voor verdachte activiteit

---

## ✅ Testchecklist

```
[ ] Bot online
[ ] API online
[ ] Database aangemaakt (data/foreverrp.sqlite bestaat)
[ ] Slash commands zichtbaar in Discord
[ ] /verify werkt (code ontvangen)
[ ] Roblox verificatie werkt (/verify FVR-XXXXXX in-game)
[ ] /userinfo werkt
[ ] /give-money werkt (bedrag verandert in-game)
[ ] /setjob werkt
[ ] /setrank werkt
[ ] /online werkt (toont spelers/servers)
[ ] /announce werkt (bericht verschijnt in-game)
[ ] /ban werkt (speler wordt gekickt + geweerd bij herjoin)
[ ] Audit logs werken (embeds in AUDIT_LOG_CHANNEL_ID)
```

---

## 🧩 Nieuwe commands toevoegen

Dankzij de generieke command-queue-architectuur (`api/routes/commands.js` + `roblox/ForeverIntegration.server.lua` → `CommandHandlers`) voeg je een nieuw admin-command in 3 stappen toe:

1. **API:** voeg het type toe aan `ALLOWED_COMMAND_TYPES` in `api/utils/validate.js` en schrijf een `case` in `validatePayload()` in `api/routes/commands.js`.
2. **Roblox:** voeg een nieuwe functie toe aan `CommandHandlers` in `ForeverIntegration.server.lua`.
3. **Bot:** maak een nieuw bestand in `bot/commands/` naar het patroon van bijvoorbeeld `setjob.js`, en voeg het toe aan `MANAGEMENT_COMMANDS` of `STAFF_COMMANDS` in `bot/utils/permissions.js`.

Geplande uitbreidingen zoals `/give-item`, `/setxp`, `/whitelist` passen allemaal in dit patroon zonder de kernqueue aan te passen.

---

## 🔐 Hoe de security werkt

| Laag | Bescherming |
|---|---|
| Discord → Bot | Discord's eigen OAuth + permission-systeem |
| Bot → API | `X-API-Key` header, verplicht op alle routes behalve `/health` |
| API | Helmet security headers, rate limiting (120 req/min globaal), strikte input-validatie op elk veld (Discord ID's, Roblox ID's, bedragen, jobs, gangs) |
| API → Roblox | Command queue met polling — Roblox voert nooit willekeurige code uit, alleen vooraf gedefinieerde `CommandHandlers` |
| Command queue | Elk command heeft een expiratie (5 min), status-machine (`pending → processing → completed/failed/expired`) voorkomt dubbele uitvoering |
| Verificatiecodes | Cryptografisch veilig gegenereerd (`crypto.randomBytes`), 10 minuten geldig, eenmalig bruikbaar |
| Roblox script | Uitsluitend server-side (Script, geen LocalScript) — de API-key is nooit clientside zichtbaar |
