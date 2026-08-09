--[[
	ForeverIntegration.server.lua

	Forever Roleplay <-> Discord integration.
	Place this script in ServerScriptService.

	SECURITY NOTES:
	- This is a Script (server-side), never a LocalScript.
	- The API key below is only ever read on the server and is never sent to clients.
	- No RemoteEvents are exposed that let clients trigger admin actions directly.
	- All admin actions arrive exclusively through the polling loop below, which
	  only accepts commands the API server itself decided to queue.
--]]

local HttpService = game:GetService("HttpService")
local Players = game:GetService("Players")
local RunService = game:GetService("RunService")

----------------------------------------------------------------
-- CONFIG — edit these values for your setup
----------------------------------------------------------------

local Config = {
	-- Your Forever RP API base URL, e.g. "https://api.foreverrp.example.com"
	API_URL = "https://YOUR-API-DOMAIN-HERE",

	-- Must match API_KEY in your Node.js .env file exactly.
	API_KEY = "YOUR-API-KEY-HERE",

	PollInterval = 3,      -- seconds between command polls
	HeartbeatInterval = 5, -- seconds between server status heartbeats

	-- Whitelisted jobs. Keep this in sync with bot/config.js -> allowedJobs
	AllowedJobs = {
		"Politie",
		"KMAR",
		"Ambulance",
		"Wegenwacht",
		"DSI",
		"PostNL",
		"Vliegschool",
		"Burger",
	},

	-- Whitelisted gangs. Keep this in sync with bot/config.js -> allowedGangs
	Gangs = {
		["GC"] = { name = "Gaviao Commando", maxLevel = 10 },
		["RZ"] = { name = "Reznikov", maxLevel = 10 },
	},

	-- ============================================================
	-- OBJECT PATH CONFIG
	-- These names depend on how your Forever RP economy/data is
	-- structured under the Player instance. Adjust if your game
	-- uses different names.
	-- ============================================================

	-- Economy folder directly under Player, containing NumberValue/IntValue
	-- instances named "Contant" and "Bank" (as specified in the prompt).
	EconomyFolderName = "Economy",
	EconomyContantValueName = "Contant",
	EconomyBankValueName = "Bank",

	-- Where the player's Job is stored — a StringValue under the Player.
	-- Adjust the path if your job is stored elsewhere (e.g. inside a
	-- "Data" folder or leaderstats).
	JobValueName = "Job",

	-- Where rank is stored — an IntValue/NumberValue under the Player.
	RankValueName = "Rank",

	-- Where gang + gang level are stored — under the Player.
	GangValueName = "Gang",
	GangLevelValueName = "GangLevel",
}

----------------------------------------------------------------
-- INTERNAL STATE
----------------------------------------------------------------

local processedCommandIds = {} -- in-memory dedupe cache for this server session

----------------------------------------------------------------
-- HTTP HELPERS
----------------------------------------------------------------

local function apiRequest(method, path, body)
	local url = Config.API_URL .. path
	local headers = {
		["Content-Type"] = "application/json",
		["X-API-Key"] = Config.API_KEY,
	}

	local ok, response = pcall(function()
		if method == "GET" then
			return HttpService:RequestAsync({
				Url = url,
				Method = "GET",
				Headers = headers,
			})
		else
			return HttpService:RequestAsync({
				Url = url,
				Method = method,
				Headers = headers,
				Body = body and HttpService:JSONEncode(body) or nil,
			})
		end
	end)

	if not ok then
		warn("[ForeverIntegration] HTTP request failed: " .. tostring(response))
		return nil
	end

	if not response.Success then
		warn(("[ForeverIntegration] API responded %d for %s %s: %s"):format(
			response.StatusCode, method, path, response.Body or ""
		))
		return nil
	end

	local decodeOk, decoded = pcall(function()
		return HttpService:JSONDecode(response.Body)
	end)

	if not decodeOk then
		warn("[ForeverIntegration] Failed to decode JSON response from " .. path)
		return nil
	end

	return decoded
end

----------------------------------------------------------------
-- ECONOMY HELPERS
----------------------------------------------------------------

local function getEconomyValue(player, valueName)
	local economy = player:FindFirstChild(Config.EconomyFolderName)
	if not economy then
		warn(("[ForeverIntegration] Player %s heeft geen '%s' folder — pas Config.EconomyFolderName aan."):format(
			player.Name, Config.EconomyFolderName
		))
		return nil
	end

	local value = economy:FindFirstChild(valueName)
	if not value then
		warn(("[ForeverIntegration] '%s' object niet gevonden onder %s — pas Config aan."):format(
			valueName, Config.EconomyFolderName
		))
		return nil
	end

	if type(value.Value) ~= "number" then
		warn(("[ForeverIntegration] '%s' is geen numerieke waarde."):format(valueName))
		return nil
	end

	return value
end

local function getAccountValueName(account)
	if account == "Contant" then
		return Config.EconomyContantValueName
	elseif account == "Bank" then
		return Config.EconomyBankValueName
	end
	return nil
end

----------------------------------------------------------------
-- COMMAND HANDLERS
----------------------------------------------------------------

local CommandHandlers = {}

CommandHandlers["give_money"] = function(player, payload)
	local valueName = getAccountValueName(payload.account)
	if not valueName then
		return false, "Onbekende rekening: " .. tostring(payload.account)
	end

	local value = getEconomyValue(player, valueName)
	if not value then
		return false, "Economy object niet gevonden"
	end

	local amount = tonumber(payload.amount)
	if not amount or amount < 0 then
		return false, "Ongeldig bedrag"
	end

	value.Value = value.Value + amount
	return true, ("+%d toegevoegd aan %s"):format(amount, payload.account)
end

CommandHandlers["remove_money"] = function(player, payload)
	local valueName = getAccountValueName(payload.account)
	if not valueName then
		return false, "Onbekende rekening: " .. tostring(payload.account)
	end

	local value = getEconomyValue(player, valueName)
	if not value then
		return false, "Economy object niet gevonden"
	end

	local amount = tonumber(payload.amount)
	if not amount or amount < 0 then
		return false, "Ongeldig bedrag"
	end

	value.Value = math.max(0, value.Value - amount)
	return true, ("-%d verwijderd van %s"):format(amount, payload.account)
end

CommandHandlers["set_money"] = function(player, payload)
	local valueName = getAccountValueName(payload.account)
	if not valueName then
		return false, "Onbekende rekening: " .. tostring(payload.account)
	end

	local value = getEconomyValue(player, valueName)
	if not value then
		return false, "Economy object niet gevonden"
	end

	local amount = tonumber(payload.amount)
	if not amount or amount < 0 then
		return false, "Ongeldig bedrag"
	end

	value.Value = amount
	return true, ("%s ingesteld op %d"):format(payload.account, amount)
end

local function isJobAllowed(job)
	for _, allowed in ipairs(Config.AllowedJobs) do
		if allowed == job then
			return true
		end
	end
	return false
end

CommandHandlers["set_job"] = function(player, payload)
	if not isJobAllowed(payload.job) then
		return false, "Job niet toegestaan: " .. tostring(payload.job)
	end

	local jobValue = player:FindFirstChild(Config.JobValueName)
	if not jobValue then
		warn(("[ForeverIntegration] '%s' object niet gevonden onder Player — pas Config.JobValueName aan."):format(
			Config.JobValueName
		))
		return false, "Job object niet gevonden"
	end

	jobValue.Value = payload.job
	return true, "Job ingesteld op " .. payload.job
end

CommandHandlers["set_rank"] = function(player, payload)
	local rankValue = player:FindFirstChild(Config.RankValueName)
	if not rankValue then
		warn(("[ForeverIntegration] '%s' object niet gevonden onder Player — pas Config.RankValueName aan."):format(
			Config.RankValueName
		))
		return false, "Rank object niet gevonden"
	end

	local rank = tonumber(payload.rank)
	if not rank or rank < 0 then
		return false, "Ongeldige rank"
	end

	rankValue.Value = rank
	return true, "Rank ingesteld op " .. tostring(rank)
end

CommandHandlers["set_gang"] = function(player, payload)
	local gangInfo = Config.Gangs[payload.gang]
	if not gangInfo then
		return false, "Gang niet toegestaan: " .. tostring(payload.gang)
	end

	local gangValue = player:FindFirstChild(Config.GangValueName)
	if not gangValue then
		warn(("[ForeverIntegration] '%s' object niet gevonden onder Player — pas Config.GangValueName aan."):format(
			Config.GangValueName
		))
		return false, "Gang object niet gevonden"
	end

	gangValue.Value = payload.gang
	return true, "Gang ingesteld op " .. payload.gang
end

CommandHandlers["set_gang_level"] = function(player, payload)
	local level = tonumber(payload.level)
	if not level or level < 0 then
		return false, "Ongeldig niveau"
	end

	-- Clamp against the max level of the player's current gang, if known.
	local gangValue = player:FindFirstChild(Config.GangValueName)
	if gangValue and Config.Gangs[gangValue.Value] then
		local maxLevel = Config.Gangs[gangValue.Value].maxLevel
		if level > maxLevel then
			return false, ("Niveau overschrijdt maximum (%d) voor deze gang"):format(maxLevel)
		end
	end

	local gangLevelValue = player:FindFirstChild(Config.GangLevelValueName)
	if not gangLevelValue then
		warn(("[ForeverIntegration] '%s' object niet gevonden onder Player — pas Config.GangLevelValueName aan."):format(
			Config.GangLevelValueName
		))
		return false, "GangLevel object niet gevonden"
	end

	gangLevelValue.Value = level
	return true, "Gangniveau ingesteld op " .. tostring(level)
end

CommandHandlers["kick"] = function(player, payload)
	local reason = payload.reason or "Gekickt door management"
	player:Kick("Forever RP: " .. reason)
	return true, "Speler gekickt"
end

CommandHandlers["ban"] = function(player, payload)
	local reason = payload.reason or "Geen reden opgegeven"
	player:Kick("Forever RP: Je bent gebanned. Reden: " .. reason)
	return true, "Speler gebanned en gekickt"
end

CommandHandlers["unban"] = function(player, payload)
	-- Unban is enforced via the API ban-status check on join; nothing to do
	-- to the currently connected player (they wouldn't be here if banned).
	return true, "Unban verwerkt"
end

----------------------------------------------------------------
-- ANNOUNCE
----------------------------------------------------------------

-- Replace this with your own GUI system. This is a minimal, easily
-- replaceable implementation using a client-side message via a
-- ScreenGui built on the fly for every player.
local function announceToAllPlayers(message)
	for _, player in ipairs(Players:GetPlayers()) do
		local playerGui = player:FindFirstChild("PlayerGui")
		if playerGui then
			local existing = playerGui:FindFirstChild("ForeverAnnouncement")
			if existing then
				existing:Destroy()
			end

			local gui = Instance.new("ScreenGui")
			gui.Name = "ForeverAnnouncement"
			gui.ResetOnSpawn = false

			local frame = Instance.new("Frame")
			frame.Size = UDim2.new(0, 500, 0, 80)
			frame.Position = UDim2.new(0.5, -250, 0, 20)
			frame.BackgroundColor3 = Color3.fromRGB(30, 58, 138) -- Forever RP dark blue
			frame.BorderSizePixel = 0
			frame.Parent = gui

			local corner = Instance.new("UICorner")
			corner.CornerRadius = UDim.new(0, 8)
			corner.Parent = frame

			local label = Instance.new("TextLabel")
			label.Size = UDim2.new(1, -20, 1, -20)
			label.Position = UDim2.new(0, 10, 0, 10)
			label.BackgroundTransparency = 1
			label.TextColor3 = Color3.fromRGB(255, 255, 255)
			label.TextWrapped = true
			label.TextScaled = false
			label.TextSize = 18
			label.Font = Enum.Font.GothamBold
			label.Text = "📢 " .. message
			label.Parent = frame

			gui.Parent = playerGui

			task.delay(10, function()
				if gui and gui.Parent then
					gui:Destroy()
				end
			end)
		end
	end
end

CommandHandlers["announce"] = function(_, payload)
	announceToAllPlayers(payload.message)
	return true, "Aankondiging weergegeven"
end

----------------------------------------------------------------
-- BAN CHECK ON JOIN
----------------------------------------------------------------

local function isBanned(userId)
	local result = apiRequest("GET", "/players/" .. tostring(userId) .. "/ban-status", nil)
	if not result then
		-- Fail open or closed depending on your risk tolerance. Fail-closed
		-- (treat as not banned) avoids locking out the whole server if the
		-- API is briefly unreachable. Change to `return true` to fail-closed
		-- the other way if you prefer stricter enforcement.
		return false
	end
	return result.banned == true, result.reason
end

local function banPlayer(player, reason)
	player:Kick("Forever RP: Je bent gebanned. Reden: " .. tostring(reason or "Geen reden opgegeven"))
end

Players.PlayerAdded:Connect(function(player)
	task.spawn(function()
		local banned, reason = isBanned(player.UserId)
		if banned then
			banPlayer(player, reason)
		end
	end)
end)

----------------------------------------------------------------
-- IN-GAME /verify CHAT COMMAND
----------------------------------------------------------------
-- Players type: /verify FVR-ABC123  in the Roblox chat to link their account.

local function handleVerifyChat(player, message)
	local code = message:match("^/verify%s+(FVR%-[A-Z0-9]+)$")
	if not code then
		return
	end

	local response = apiRequest("POST", "/verification/complete", {
		code = code,
		robloxId = tostring(player.UserId),
		robloxUsername = player.Name,
	})

	if response and response.success then
		-- Replace with your own notification GUI/system if desired.
		local ok = pcall(function()
			game:GetService("StarterGui"):SetCore("SendNotification", {
				Title = "Forever RP",
				Text = "Account succesvol gekoppeld aan Discord!",
				Duration = 5,
			})
		end)
		if not ok then
			print(("[ForeverIntegration] %s heeft zijn account gekoppeld."):format(player.Name))
		end
	else
		warn(("[ForeverIntegration] Verificatie mislukt voor %s met code %s"):format(player.Name, code))
	end
end

Players.PlayerAdded:Connect(function(player)
	player.Chatted:Connect(function(message)
		handleVerifyChat(player, message)
	end)
end)

----------------------------------------------------------------
-- COMMAND POLLING LOOP
----------------------------------------------------------------

local function getOnlineUserIds()
	local ids = {}
	for _, player in ipairs(Players:GetPlayers()) do
		table.insert(ids, tostring(player.UserId))
	end
	-- Always poll for broadcast/announce commands even with 0 players online.
	if #ids == 0 then
		table.insert(ids, "0")
	end
	return ids
end

local function completeCommand(commandId, success, resultText)
	apiRequest("POST", "/roblox/complete", {
		commandId = commandId,
		success = success,
		result = resultText,
	})
end

local function processCommand(command)
	-- Duplicate-execution protection: skip if we've already processed this
	-- command ID in this server session.
	if processedCommandIds[command.id] then
		return
	end
	processedCommandIds[command.id] = true

	local handler = CommandHandlers[command.type]
	if not handler then
		completeCommand(command.id, false, "Geen handler voor type: " .. tostring(command.type))
		return
	end

	-- Broadcast-type commands (announce) don't target a specific player.
	if command.type == "announce" then
		local ok, message = handler(nil, command.payload)
		completeCommand(command.id, ok, message)
		return
	end

	local targetPlayer = Players:GetPlayerByUserId(tonumber(command.robloxId))
	if not targetPlayer then
		-- Player isn't in this server instance — leave it for another server
		-- (or a future poll once they join) by NOT marking success. We still
		-- report failure so the queue doesn't stall on this instance, but
		-- since /roblox/complete moves it to "failed" (not deleted), consider
		-- building a retry mechanism in the API if commands must reach
		-- offline players. For now, admin commands are expected to run while
		-- the target player is online.
		completeCommand(command.id, false, "Speler niet gevonden in deze server-instance")
		return
	end

	local ok, message = handler(targetPlayer, command.payload)
	completeCommand(command.id, ok, message)
end

local function pollCommands()
	local response = apiRequest("POST", "/roblox/poll", {
		robloxIds = getOnlineUserIds(),
		jobId = game.JobId,
	})

	if not response or not response.commands then
		return
	end

	for _, command in ipairs(response.commands) do
		processCommand(command)
	end
end

----------------------------------------------------------------
-- HEARTBEAT LOOP
----------------------------------------------------------------

local function sendHeartbeat()
	apiRequest("POST", "/roblox/heartbeat", {
		jobId = game.JobId,
		players = #Players:GetPlayers(),
		maxPlayers = Players.MaxPlayers,
	})
end

----------------------------------------------------------------
-- MAIN LOOPS
----------------------------------------------------------------

task.spawn(function()
	while true do
		task.wait(Config.PollInterval)
		pollCommands()
	end
end)

task.spawn(function()
	while true do
		sendHeartbeat()
		task.wait(Config.HeartbeatInterval)
	end
end)

print("[ForeverIntegration] Forever RP Discord integratie geladen.")
