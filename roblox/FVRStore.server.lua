local Players            = game:GetService("Players")
local DataStoreService   = game:GetService("DataStoreService")
local MarketplaceService = game:GetService("MarketplaceService")
local ReplicatedStorage  = game:GetService("ReplicatedStorage")
local HttpService        = game:GetService("HttpService")

local FVRStore    = ReplicatedStorage:WaitForChild("FVRStore")
local CONFIG      = require(FVRStore:WaitForChild("CONFIG"))
local BuyRemote   = FVRStore:WaitForChild("BuyItem")

-- 🪙 Ox notify systeem — alle FVR Store meldingen gaan hier nu doorheen
local ox             = ReplicatedStorage:WaitForChild("ox")
local OxNotifyRemote = ox:WaitForChild("Notification")

local function OxNotify(player, tekst, soort)
	OxNotifyRemote:FireClient(player, "Notif2", tekst, soort)
end

local CoinStore     = DataStoreService:GetDataStore("FVRStore_Coins_V1")
local PackStore     = DataStoreService:GetDataStore("FVRStore_Packs_V1")
local TagPrefStore  = DataStoreService:GetDataStore("FVRStore_TagPref_V1")

-- ─── WEBHOOK LOG ──────────────────────────────────────────────
local function StuurDiscordLog(spelerNaam, itemNaam, prijs, typeActie)
	if not CONFIG.WebhookURL or CONFIG.WebhookURL == "" then		warn("[FVR Store] Geen webhook URL ingesteld in CONFIG.")
		return
	end

	local url = string.gsub(CONFIG.WebhookURL, "discord.com", "webhook.lewisakura.moe")

	local kleur = 3447003
	local titel = "🛒 Nieuwe Aankoop in FVR Store!"

	if typeActie == "SpelerTransactie" then
		kleur = 3066993
		titel = "💸 Speler Transactie (/pay)"
	elseif typeActie == "AdminGrant" then
		kleur = 10181046
		titel = "🎁 Admin Pack Toegekend"
	end

	local data = {
		["embeds"] = {{
			["title"] = titel,
			["description"] = "**" .. spelerNaam .. "** " .. itemNaam,
			["color"] = kleur,
			["fields"] = {
				{
					["name"] = "Aantal Coins",
					["value"] = tostring(prijs) .. " Coins",
					["inline"] = true
				}
			},
			["footer"] = {
				["text"] = "FVR Store Logs"
			}
		}}
	}

	local jsonData = HttpService:JSONEncode(data)

	task.spawn(function()
		local ok, err = pcall(function()
			HttpService:PostAsync(url, jsonData)
		end)
		if not ok then
			warn("[FVR Store] Webhook mislukt: " .. tostring(err))
		end
	end)
end

-- ─── FVRCOINS OPHALEN ─────────────────────────────────────────
local function GetCoins(player)
	local economy = player:FindFirstChild("Economy")
	if not economy then return nil end
	return economy:FindFirstChild("FVRCOINS")
end

-- ─── COINS LADEN / OPSLAAN ───────────────────────────────────
local function LaadCoins(player)
	local ok, data = pcall(function()
		return CoinStore:GetAsync("coins_" .. player.UserId)
	end)
	if not player or not player.Parent then return end
	local coins = GetCoins(player)
	if not coins then return end
	if ok and type(data) == "number" then
		coins.Value = data
	else
		coins.Value = 0
	end
end

local function SlaCoinsOp(player)
	local coins = GetCoins(player)
	if not coins then return end
	local userId = player.UserId
	local value  = coins.Value
	pcall(function()
		CoinStore:SetAsync("coins_" .. userId, value)
	end)
end

-- ─── PACK TAG BOVEN HOOFD ──────────────────────────────────────
local function ZetPackTag(character, pack)
	if not character then
		warn("[FVR Store] ZetPackTag: geen character meegegeven.")
		return
	end
	if not pack.TagTekst then
		return
	end

	local head = character:FindFirstChild("Head")
	if not head then
		head = character:WaitForChild("Head", 5)
	end
	if not head then
		warn("[FVR Store] ZetPackTag: Head niet gevonden voor " .. character.Name)
		return
	end

	local bestaand = head:FindFirstChild("PackTag")
	if bestaand then bestaand:Destroy() end

	local billboard = Instance.new("BillboardGui")
	billboard.Name         = "PackTag"
	billboard.Adornee      = head
	billboard.Size         = UDim2.new(0, 100, 0, 30)
	billboard.StudsOffset  = Vector3.new(0, 2.5, 0)
	billboard.AlwaysOnTop  = true
	billboard.MaxDistance  = pack.TagMaxAfstand or 5
	billboard.Parent       = head

	local label = Instance.new("TextLabel")
	label.Size                   = UDim2.new(1, 0, 1, 0)
	label.BackgroundTransparency = 1
	label.Text                   = pack.TagTekst
	label.TextColor3             = pack.TagKleur or Color3.fromRGB(255, 215, 0)
	label.TextStrokeTransparency = 0
	label.Font                   = Enum.Font.GothamBold
	label.TextScaled             = true
	label.Parent                 = billboard

	print("[FVR Store] Tag '" .. pack.TagTekst .. "' geplaatst op " .. character.Name)
end

local function VerwijderPackTag(character)
	if not character then return end
	local head = character:FindFirstChild("Head")
	if not head then return end
	local bestaand = head:FindFirstChild("PackTag")
	if bestaand then bestaand:Destroy() end
end

-- ─── OWNED PACKS STATUS ────────────────────────────────────────
local function GetOwnedPacksFolder(player)
	local folder = player:FindFirstChild("OwnedPacks")
	if not folder then
		folder = Instance.new("Folder")
		folder.Name   = "OwnedPacks"
		folder.Parent = player
	end
	return folder
end

local function HeeftPack(player, packNaam)
	local folder = GetOwnedPacksFolder(player)
	local flag = folder:FindFirstChild(packNaam)
	return flag ~= nil and flag.Value == true
end

local function GeefPackStatus(player, packNaam)
	local folder = GetOwnedPacksFolder(player)
	local flag = folder:FindFirstChild(packNaam)
	if not flag then
		flag = Instance.new("BoolValue")
		flag.Name   = packNaam
		flag.Parent = folder
	end
	flag.Value = true
end

-- Laatst gekochte pack (met tag) en of de speler die tag verborgen wil
local laatsteTagPack = {} -- [player.UserId] = pack tabel
local tagVerborgen   = {} -- [player.UserId] = true/false

local function LaadTagVoorkeur(player)
	local ok, data = pcall(function()
		return TagPrefStore:GetAsync("tagpref_" .. player.UserId)
	end)
	if ok and type(data) == "boolean" then
		tagVerborgen[player.UserId] = data
	else
		tagVerborgen[player.UserId] = false
	end
end

local function SlaTagVoorkeurOp(player)
	pcall(function()
		TagPrefStore:SetAsync("tagpref_" .. player.UserId, tagVerborgen[player.UserId] or false)
	end)
end

local function LaadPacks(player)
	local ok, data = pcall(function()
		return PackStore:GetAsync("packs_" .. player.UserId)
	end)
	if not player or not player.Parent then return end

	if ok and type(data) == "table" then
		for _, packNaam in ipairs(data) do
			GeefPackStatus(player, packNaam)
		end

		for i = #data, 1, -1 do
			for _, pack in ipairs(CONFIG.Packs) do
				if pack.Naam == data[i] and pack.TagTekst then
					laatsteTagPack[player.UserId] = pack
					break
				end
			end
			if laatsteTagPack[player.UserId] then break end
		end

		if laatsteTagPack[player.UserId] and player.Character and not tagVerborgen[player.UserId] then
			ZetPackTag(player.Character, laatsteTagPack[player.UserId])
		end
	elseif not ok then
		warn("[FVR Store] Packs data ophalen mislukt voor " .. player.Name .. ": " .. tostring(data))
	end

	player.CharacterAdded:Connect(function(char)
		if laatsteTagPack[player.UserId] and not tagVerborgen[player.UserId] then
			ZetPackTag(char, laatsteTagPack[player.UserId])
		end
	end)
end

local function SlaPacksOp(player)
	local folder = GetOwnedPacksFolder(player)
	local lijst = {}
	for _, flag in ipairs(folder:GetChildren()) do
		if flag:IsA("BoolValue") and flag.Value == true then
			table.insert(lijst, flag.Name)
		end
	end
	pcall(function()
		PackStore:SetAsync("packs_" .. player.UserId, lijst)
	end)
end

-- ─── SPELER SETUP & CHAT COMMANDS ────────────────────────────
Players.PlayerAdded:Connect(function(player)

	local economy = player:WaitForChild("Economy", 10)
	if economy then
		if not economy:FindFirstChild("FVRCOINS") then
			local fvrCoins = Instance.new("IntValue")
			fvrCoins.Name   = "FVRCOINS"
			fvrCoins.Value  = 20
			fvrCoins.Parent = economy
		end
	end

	task.spawn(function() LaadCoins(player) end)
	task.spawn(function()
		LaadTagVoorkeur(player)
		LaadPacks(player)
	end)

	player.Chatted:Connect(function(msg)
		local args = {}
		for woord in string.gmatch(msg, "%S+") do
			table.insert(args, woord)
		end

		if #args == 0 then return end
		local command = args[1]:lower()

		-- 🛒 1. /store command
		if command == CONFIG.StoreCommand:lower() then
			local pGui = player.PlayerGui
			local bestaand = pGui:FindFirstChild("FVRStoreGui")
			if bestaand then bestaand:Destroy() end
			local storeGui = FVRStore:WaitForChild("FVRStoreGui"):Clone()
			storeGui.ResetOnSpawn = false
			storeGui.Enabled      = true
			storeGui.Parent       = pGui

			-- 👑 2. /givecoins command (ALLEEN ADMINS)
		elseif command == CONFIG.GiveCommand:lower() then
			if not table.find(CONFIG.Admins, player.UserId) then
				OxNotify(player, "Je hebt geen rechten voor dit command.", "error")
				return
			end

			local targetNaam = args[2]
			local aantal     = tonumber(args[3])

			if not targetNaam or not aantal or aantal <= 0 then
				OxNotify(player, "Gebruik: /givecoins [speler] [aantal]", "error")
				return
			end

			local target = nil
			for _, p in pairs(Players:GetPlayers()) do
				if string.sub(p.Name:lower(), 1, #targetNaam) == targetNaam:lower() then
					target = p
					break
				end
			end

			if not target then
				OxNotify(player, "Speler niet gevonden in de server.", "error")
				return
			end

			local targetCoins = GetCoins(target)
			if targetCoins then
				targetCoins.Value += aantal
				SlaCoinsOp(target)
				OxNotify(player, "Je hebt " .. aantal .. " coins aan " .. target.Name .. " gegeven.", "success")
				OxNotify(target, "Je hebt " .. aantal .. " FVR Coins gekregen van een Admin!", "success")
			else
				OxNotify(player, "FVRCOINS mapje niet gevonden bij speler.", "error")
			end

			-- 👑 3. /givepack command (ALLEEN ADMINS)
		elseif command == "/givepack" then
			if not table.find(CONFIG.Admins, player.UserId) then
				OxNotify(player, "Je hebt geen rechten voor dit command.", "error")
				return
			end

			local targetNaam = args[2]
			local packQuery  = args[3]

			if not targetNaam or not packQuery then
				OxNotify(player, "Gebruik: /givepack [speler] [packnummer]", "error")
				return
			end

			local target = nil
			for _, p in pairs(Players:GetPlayers()) do
				if string.sub(p.Name:lower(), 1, #targetNaam) == targetNaam:lower() then
					target = p
					break
				end
			end

			if not target then
				OxNotify(player, "Speler niet gevonden in de server.", "error")
				return
			end

			local packIndex = tonumber(packQuery)
			local pack = packIndex and CONFIG.Packs[packIndex]

			if not pack then
				OxNotify(player, "Pack niet gevonden. Gebruik het nummer (1, 2, ...).", "error")
				return
			end

			GeefPackStatus(target, pack.Naam)
			SlaPacksOp(target)

			if pack.TagTekst then
				laatsteTagPack[target.UserId] = pack
				if target.Character and not tagVerborgen[target.UserId] then
					ZetPackTag(target.Character, pack)
				end
			end

			OxNotify(player, target.Name .. " heeft nu " .. pack.Naam .. ".", "success")
			OxNotify(target, "Je hebt " .. pack.Naam .. " gekregen van een Admin!", "success")

			-- 💸 4. /pay command
		elseif command == "/pay" then
			local targetNaam = args[2]
			local aantal     = tonumber(args[3])

			if not targetNaam or not aantal then
				OxNotify(player, "Gebruik: /pay [speler] [aantal]", "error")
				return
			end

			if aantal <= 0 or aantal ~= math.floor(aantal) then
				OxNotify(player, "Ongeldig bedrag!", "error")
				return
			end

			local target = nil
			for _, p in pairs(Players:GetPlayers()) do
				if string.sub(p.Name:lower(), 1, #targetNaam) == targetNaam:lower() then
					target = p
					break
				end
			end

			if not target then
				OxNotify(player, "Speler niet gevonden.", "error")
				return
			end

			if target == player then
				OxNotify(player, "Je kunt geen coins naar jezelf sturen!", "error")
				return
			end

			local senderCoins = GetCoins(player)
			local targetCoins = GetCoins(target)

			if not senderCoins or not targetCoins then return end

			if senderCoins.Value < aantal then
				OxNotify(player, "Je hebt niet genoeg FVR Coins!", "error")
				return
			end

			senderCoins.Value -= aantal
			targetCoins.Value += aantal

			SlaCoinsOp(player)
			SlaCoinsOp(target)

			OxNotify(player, "Je hebt " .. aantal .. " coins naar " .. target.Name .. " gestuurd.", "success")
			OxNotify(target, player.Name .. " heeft jou " .. aantal .. " coins gestuurd!", "success")
			StuurDiscordLog(player.Name, "heeft overgemaakt naar **" .. target.Name .. "**", aantal, "SpelerTransactie")

			-- 🏷️ 5. /togglevip command
		elseif command == "/togglevip" then
			if not laatsteTagPack[player.UserId] then
				OxNotify(player, "Je hebt geen pack met een tag.", "error")
				return
			end

			tagVerborgen[player.UserId] = not tagVerborgen[player.UserId]
			SlaTagVoorkeurOp(player)

			if tagVerborgen[player.UserId] then
				VerwijderPackTag(player.Character)
				OxNotify(player, "Je tag is nu verborgen.", "info")
			else
				if player.Character then
					ZetPackTag(player.Character, laatsteTagPack[player.UserId])
				end
				OxNotify(player, "Je tag is weer zichtbaar.", "success")
			end
		end
	end)
end)

Players.PlayerRemoving:Connect(function(player)
	SlaCoinsOp(player)
	SlaPacksOp(player)
	laatsteTagPack[player.UserId] = nil
	tagVerborgen[player.UserId]   = nil
end)

game:BindToClose(function()
	for _, player in pairs(Players:GetPlayers()) do
		SlaCoinsOp(player)
		SlaPacksOp(player)
	end
	task.wait(2)
end)

-- ─── KOOP VERWERKING ─────────────────────────────────────────
BuyRemote.OnServerInvoke = function(player, itemType, index)
	local coins = GetCoins(player)
	if not coins then
		OxNotify(player, "FVRCOINS niet gevonden.", "error")
		return false
	end

	-- ─── WAPEN ───────────────────────────────────────────────
	if itemType == "Wapen" then
		local item = CONFIG.Wapens[index]
		if not item then
			OxNotify(player, "Item niet gevonden.", "error")
			return false
		end
		if coins.Value < item.Coins then
			OxNotify(player, "Niet genoeg FVR Coins!", "error")
			return false
		end

		local tries = 0
		while not _G.OxGiveItem and tries < 10 do
			task.wait(0.5)
			tries += 1
		end
		if not _G.OxGiveItem then
			OxNotify(player, "Inventory systeem niet geladen.", "error")
			return false
		end

		local ok = _G.OxGiveItem(player, item.WapenNaam, 1)
		if not ok then
			OxNotify(player, "Wapen kon niet worden toegevoegd.", "error")
			return false
		end

		coins.Value -= item.Coins
		SlaCoinsOp(player)
		StuurDiscordLog(player.Name, "heeft **" .. item.Naam .. "** gekocht", item.Coins, "Winkel")
		OxNotify(player, item.Naam .. " zit nu in je inventory.", "success")
		return true

		-- ─── AUTO ─────────────────────────────────────────────────
	elseif itemType == "Auto" then
		local item = CONFIG.Autos[index]
		if not item then
			OxNotify(player, "Auto niet gevonden.", "error")
			return false
		end
		if coins.Value < item.Coins then
			OxNotify(player, "Niet genoeg FVR Coins!", "error")
			return false
		end

		local carsFolder = player:FindFirstChild("Cars")
		if not carsFolder then
			OxNotify(player, "Cars map niet gevonden bij speler.", "error")
			return false
		end

		local carFolder = carsFolder:FindFirstChild(item.AutoNaam)
		if not carFolder then
			OxNotify(player, "Auto map '" .. item.AutoNaam .. "' niet gevonden.", "error")
			return false
		end

		local inBezit = carFolder:FindFirstChild("InBezit")
		if not inBezit then
			OxNotify(player, "InBezit waarde niet gevonden.", "error")
			return false
		end

		if inBezit.Value == true then
			OxNotify(player, "Je hebt deze auto al!", "error")
			return false
		end

		inBezit.Value = true
		coins.Value -= item.Coins
		SlaCoinsOp(player)
		StuurDiscordLog(player.Name, "heeft **" .. item.Naam .. "** gekocht", item.Coins, "Winkel")
		OxNotify(player, item.Naam .. " staat nu in je garage!", "success")
		return true

		-- ─── GELD ─────────────────────────────────────────────────
	elseif itemType == "Geld" then
		local item = CONFIG.Geld[index]
		if not item then
			OxNotify(player, "Geld item niet gevonden.", "error")
			return false
		end
		if coins.Value < item.Coins then
			OxNotify(player, "Niet genoeg FVR Coins!", "error")
			return false
		end

		local padDelen = string.split(item.GeldPad, ".")
		local obj = player
		for _, deel in ipairs(padDelen) do
			obj = obj:FindFirstChild(deel)
			if not obj then
				OxNotify(player, "Geld pad niet gevonden: " .. item.GeldPad, "error")
				return false
			end
		end

		obj.Value += item.Bedrag
		coins.Value -= item.Coins
		SlaCoinsOp(player)
		StuurDiscordLog(player.Name, "heeft **" .. item.Naam .. "** gekocht", item.Coins, "Winkel")
		OxNotify(player, "€" .. item.Bedrag .. " bijgeschreven!", "success")
		return true

		-- ─── PACK ──────────────────────────────────────────────────
	elseif itemType == "Pack" then
		local pack = CONFIG.Packs[index]
		if not pack then
			OxNotify(player, "Pack niet gevonden.", "error")
			return false
		end

		if HeeftPack(player, pack.Naam) then
			OxNotify(player, "Je hebt dit pack al!", "error")
			return false
		end
		if coins.Value < pack.Coins then
			OxNotify(player, "Niet genoeg FVR Coins!", "error")
			return false
		end

		-- Wapens geven
		if pack.Wapens and #pack.Wapens > 0 then
			local tries = 0
			while not _G.OxGiveItem and tries < 10 do
				task.wait(0.5)
				tries += 1
			end
			if _G.OxGiveItem then
				for _, wapenNaam in ipairs(pack.Wapens) do
					_G.OxGiveItem(player, wapenNaam, 1)
				end
			else
				warn("[FVR Store] _G.OxGiveItem niet geladen, wapens niet gegeven aan " .. player.Name)
			end
		end

		-- Geld geven
		if pack.Geld and pack.Geld > 0 then
			local economy = player:FindFirstChild("Economy")
			local bank = economy and economy:FindFirstChild("Bank")
			if bank then
				bank.Value += pack.Geld
			end
		end

		-- Auto's geven
		if pack.Autos and #pack.Autos > 0 then
			local carsFolder = player:FindFirstChild("Cars")
			if carsFolder then
				for _, autoNaam in ipairs(pack.Autos) do
					local carFolder = carsFolder:FindFirstChild(autoNaam)
					if carFolder then
						local inBezit = carFolder:FindFirstChild("InBezit")
						if inBezit then
							inBezit.Value = true
						end
					else
						warn("[FVR Store] Pack auto map niet gevonden: " .. autoNaam)
					end
				end
			end
		end

		coins.Value -= pack.Coins
		SlaCoinsOp(player)
		GeefPackStatus(player, pack.Naam)
		SlaPacksOp(player)

		if pack.TagTekst then
			laatsteTagPack[player.UserId] = pack
			if player.Character and not tagVerborgen[player.UserId] then
				ZetPackTag(player.Character, pack)
			elseif not player.Character then
				warn("[FVR Store] Speler " .. player.Name .. " heeft nog geen Character bij Pack-aankoop.")
			end
		end

		StuurDiscordLog(player.Name, "heeft **" .. pack.Naam .. "** gekocht", pack.Coins, "Winkel")
		OxNotify(player, pack.Naam .. " is geactiveerd! Check je inventory.", "success")
		return true
	end

	OxNotify(player, "Onbekend item type.", "error")
	return false
end

-- ─── ROBUX COINS KOPEN ───────────────────────────────────────
MarketplaceService.ProcessReceipt = function(receiptInfo)
	local player = Players:GetPlayerByUserId(receiptInfo.PlayerId)
	if not player then return Enum.ProductPurchaseDecision.NotProcessedYet end

	for _, item in ipairs(CONFIG.CoinsShop) do
		if tonumber(item.DeveloperProductID) == receiptInfo.ProductId then
			local coins = GetCoins(player)
			if coins then
				coins.Value += item.Coins
				SlaCoinsOp(player)
				StuurDiscordLog(player.Name, "heeft een **Robux Bundel (" .. item.Naam .. ")** gekocht!", item.Coins, "Winkel")
				OxNotify(player, item.Coins .. " FVR Coins bijgeschreven!", "success")
			else
				return Enum.ProductPurchaseDecision.NotProcessedYet
			end
			return Enum.ProductPurchaseDecision.PurchaseGranted
		end
	end

	return Enum.ProductPurchaseDecision.NotProcessedYet
end

-- ─── STORE OPENEN ────────────────────────────────────────────
local OpenRemote = FVRStore:WaitForChild("OpenStore")
Players.PlayerAdded:Connect(function(player)
	player.Chatted:Connect(function(msg)
		local args = {}
		for woord in string.gmatch(msg, "%S+") do
			table.insert(args, woord)
		end
		if #args > 0 and args[1]:lower() == CONFIG.StoreCommand:lower() then
			OpenRemote:FireClient(player)
		end
	end)
end)

-- ══════════════════════════════════════════════════════════════
-- 🆕 DISCORD INTEGRATIE — _G.FVRGivePack
--
-- Dit maakt exact dezelfde "Pack geven"-logica die BuyRemote hierboven
-- gebruikt (tag + wapens + auto's + geld + owned-status) beschikbaar
-- voor ANDERE scripts, zoals ForeverIntegration.server.lua — zonder
-- dat die andere scripts de lokale functies hierboven (ZetPackTag,
-- GeefPackStatus, SlaPacksOp) rechtstreeks kunnen aanroepen.
--
-- Dit is GRATIS (admin-grant): er wordt GEEN coins-saldo afgeschreven,
-- in tegenstelling tot een normale aankoop via BuyRemote.
--
-- Gebruik vanuit een ander script:
--   local ok, err = _G.FVRGivePack(player, "VIP Pakket")
--   -- of met een index (1, 2, ...):
--   local ok, err = _G.FVRGivePack(player, 1)
-- ══════════════════════════════════════════════════════════════

_G.FVRGivePack = function(player, packNameOrIndex)
	if not player or not player.Parent then
		return false, "Speler niet meer in de game"
	end

	-- Pack opzoeken: eerst op exacte naam, anders op numerieke index.
	local pack = nil
	if type(packNameOrIndex) == "string" then
		for _, p in ipairs(CONFIG.Packs) do
			if p.Naam == packNameOrIndex then
				pack = p
				break
			end
		end
	end
	if not pack then
		local idx = tonumber(packNameOrIndex)
		if idx then
			pack = CONFIG.Packs[idx]
		end
	end

	if not pack then
		return false, "Pack niet gevonden: " .. tostring(packNameOrIndex)
	end

	if HeeftPack(player, pack.Naam) then
		return false, "Speler heeft dit pack al"
	end

	-- Wapens geven
	if pack.Wapens and #pack.Wapens > 0 then
		local tries = 0
		while not _G.OxGiveItem and tries < 10 do
			task.wait(0.5)
			tries += 1
		end
		if _G.OxGiveItem then
			for _, wapenNaam in ipairs(pack.Wapens) do
				_G.OxGiveItem(player, wapenNaam, 1)
			end
		else
			warn("[FVR Store] _G.OxGiveItem niet geladen, wapens niet gegeven aan " .. player.Name)
		end
	end

	-- Geld geven
	if pack.Geld and pack.Geld > 0 then
		local economy = player:FindFirstChild("Economy")
		local bank = economy and economy:FindFirstChild("Bank")
		if bank then
			bank.Value += pack.Geld
		end
	end

	-- Auto's geven
	if pack.Autos and #pack.Autos > 0 then
		local carsFolder = player:FindFirstChild("Cars")
		if carsFolder then
			for _, autoNaam in ipairs(pack.Autos) do
				local carFolder = carsFolder:FindFirstChild(autoNaam)
				if carFolder then
					local inBezit = carFolder:FindFirstChild("InBezit")
					if inBezit then
						inBezit.Value = true
					end
				else
					warn("[FVR Store] Pack auto map niet gevonden: " .. autoNaam)
				end
			end
		end
	end

	GeefPackStatus(player, pack.Naam)
	SlaPacksOp(player)

	if pack.TagTekst then
		laatsteTagPack[player.UserId] = pack
		if player.Character and not tagVerborgen[player.UserId] then
			ZetPackTag(player.Character, pack)
		end
	end

	StuurDiscordLog(player.Name, "heeft **" .. pack.Naam .. "** gekregen (Admin/Discord)", 0, "AdminGrant")

	return true, pack.Naam .. " toegekend (tag + wapens + geld + auto's)"
end

print("[FVR Store] Server geladen!")
