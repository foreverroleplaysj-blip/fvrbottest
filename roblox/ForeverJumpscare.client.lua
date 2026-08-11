--[[
	ForeverJumpscare.client.lua

	Place this LocalScript in StarterPlayer > StarterPlayerScripts.

	Listens for the ForeverJumpscareRemote event (fired by
	ForeverIntegration.server.lua when a management member runs /jumpscare
	in Discord) and shows a fullscreen image + plays a sound, ONLY on the
	targeted player's own screen. Nothing is sent to other clients.
--]]

local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
local TweenService = game:GetService("TweenService")

local player = Players.LocalPlayer
local playerGui = player:WaitForChild("PlayerGui")

local remote = ReplicatedStorage:WaitForChild("ForeverJumpscareRemote")

local function playJumpscare(imageAssetId, soundAssetId)
	-- Avoid stacking multiple jumpscares if triggered more than once quickly.
	local existing = playerGui:FindFirstChild("ForeverJumpscareGui")
	if existing then
		existing:Destroy()
	end

	local gui = Instance.new("ScreenGui")
	gui.Name = "ForeverJumpscareGui"
	gui.IgnoreGuiInset = true
	gui.DisplayOrder = 999
	gui.ResetOnSpawn = false

	local image = Instance.new("ImageLabel")
	image.Size = UDim2.fromScale(1, 1)
	image.BackgroundColor3 = Color3.new(0, 0, 0)
	image.BackgroundTransparency = 0
	image.Image = imageAssetId
	image.ImageTransparency = 0
	image.ScaleType = Enum.ScaleType.Crop
	image.Parent = gui

	gui.Parent = playerGui

	-- Play sound
	local sound = Instance.new("Sound")
	sound.SoundId = soundAssetId
	sound.Volume = 1
	sound.Parent = gui
	sound:Play()

	-- Fade out after a short "scare" duration.
	task.delay(1.2, function()
		local tween = TweenService:Create(image, TweenInfo.new(0.6, Enum.EasingStyle.Quad), {
			ImageTransparency = 1,
			BackgroundTransparency = 1,
		})
		tween:Play()
		tween.Completed:Connect(function()
			gui:Destroy()
		end)
	end)
end

remote.OnClientEvent:Connect(playJumpscare)
