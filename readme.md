# Rock Paper Scissors Discord Bot

A Discord bot that allows two users to play rock paper scissors in a text channel with interactive buttons and slash commands.

## Features

- 🎮 **Interactive Gameplay**: Uses Discord's slash commands and buttons for a smooth experience
- 👥 **Two-Player Games**: One user can challenge another to a game
- 🔒 **Channel Validation**: Bot must be present in the channel for games to work
- 🤐 **Hidden Choices**: Player choices are only revealed after both players have made their selection
- ⏱️ **Auto-Expiration**: Challenges automatically expire after 60 seconds
- 🔄 **Play Again**: Easy rematch functionality
- ✨ **Rich Embeds**: Beautiful game interface with emojis and status updates

## Setup Instructions

### 1. Create a Discord Application and Bot

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Go to the "Bot" section and click "Add Bot"
4. Copy the bot token (you'll need this for the `.env` file)
5. Under "Privileged Gateway Intents", enable:
   - Message Content Intent
6. Go to the "OAuth2" section and copy the "Application ID" (you'll need this for the `.env` file)

### 2. Install Dependencies

```bash
npm install
```

### 3. Configure Environment Variables

1. Copy `.env.example` to `.env`:

   ```bash
   cp .env.example .env
   ```

2. Edit `.env` and add your Discord bot credentials:

   ```env
   BOT_TOKEN=your_discord_bot_token_here
   CLIENT_ID=your_discord_application_id_here
   ```

### 4. Invite the Bot to Your Server

1. Go to the Discord Developer Portal → OAuth2 → URL Generator
2. Select scopes: `bot` and `applications.commands`
3. Select bot permissions: `Send Messages`, `Use Slash Commands`, `Embed Links`, `Read Message History`
4. Copy the generated URL and use it to invite the bot to your server

### 5. Run the Bot

```bash
npm start
```

For development with auto-restart:

```bash
npm run dev
```

## How to Play

1. **Start a Game**: Use `/rps @opponent` to challenge someone
2. **Accept/Decline**: The challenged player clicks Accept or Decline
3. **Make Choices**: Both players click Rock 🪨, Paper 📄, or Scissors ✂️
4. **See Results**: Once both players choose, the results are revealed
5. **Play Again**: Click "Play Again" for a rematch

## Game Rules

- 🪨 Rock beats ✂️ Scissors
- 📄 Paper beats 🪨 Rock  
- ✂️ Scissors beats 📄 Paper
- Same choices result in a tie

## Commands

- `/rps @user` - Challenge a user to rock paper scissors

## Requirements

- The bot must be present in the text channel where the game is played
- Cannot challenge bots or yourself
- Only one active game per player pair at a time
- Challenges expire after 60 seconds if not accepted

## Technical Details

- Built with Discord.js v14
- Uses slash commands and button interactions
- Implements game state management
- Handles error cases and validation
- Auto-cleanup of expired games

## Troubleshooting

- Make sure the bot has the required permissions in the channel
- Verify your bot token and client ID are correct in the `.env` file
- Check that the bot is online and properly invited to your server
- Ensure Discord.js is properly installed with `npm install`
