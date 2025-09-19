const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  SlashCommandBuilder,
  REST,
  Routes,
} = require("discord.js");
require("dotenv").config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
  ],
});

// Store active games
const activeGames = new Map();

// Game class to manage individual rock paper crane games with multiple rounds
class RPCGame {
  constructor(challenger, challenged, channelId) {
    this.challenger = challenger;
    this.challenged = challenged;
    this.channelId = channelId;
    this.gameId = `${challenger.id}-${challenged.id}-${Date.now()}`;

    // Round management
    this.currentRound = 1;
    this.challengerChoice = null;
    this.challengedChoice = null;
    this.gamePhase = "playing"; // 'playing', 'upgrading', 'completed'
    this.pendingUpgrader = null; // who needs to select an upgrade

    // Player upgrades - track which items have been upgraded
    this.challengerUpgrades = {
      rock: false,
      paper: false,
      scissors: false,
      bomb: false,
    };
    this.challengedUpgrades = {
      rock: false,
      paper: false,
      scissors: false,
      bomb: false,
    };

    // Round wins tracking
    this.challengerWins = 0;
    this.challengedWins = 0;
    this.ties = 0;
  }

  makeChoice(userId, choice) {
    if (userId === this.challenger.id) {
      this.challengerChoice = choice;
    } else if (userId === this.challenged.id) {
      this.challengedChoice = choice;
    }
  }

  bothPlayersReady() {
    return this.challengerChoice && this.challengedChoice;
  }

  resetRound() {
    this.challengerChoice = null;
    this.challengedChoice = null;
    this.currentRound++;
    this.gamePhase = "playing";
    this.pendingUpgrader = null;
  }

  makeUpgrade(userId, item) {
    if (userId === this.challenger.id) {
      this.challengerUpgrades[item] = true;
    } else if (userId === this.challenged.id) {
      this.challengedUpgrades[item] = true;
    }

    // Check for game completion
    if (this.hasAllUpgrades(userId)) {
      this.gamePhase = "completed";
    } else {
      this.resetRound();
    }
  }

  hasAllUpgrades(userId) {
    const upgrades =
      userId === this.challenger.id
        ? this.challengerUpgrades
        : this.challengedUpgrades;
    return Object.values(upgrades).every((upgraded) => upgraded);
  }

  getAvailableUpgrades(userId) {
    const upgrades =
      userId === this.challenger.id
        ? this.challengerUpgrades
        : this.challengedUpgrades;
    return Object.keys(upgrades).filter((item) => !upgrades[item]);
  }

  getUpgradeCount(userId) {
    const upgrades =
      userId === this.challenger.id
        ? this.challengerUpgrades
        : this.challengedUpgrades;
    return Object.values(upgrades).filter((upgraded) => upgraded).length;
  }

  // Get the actual choice (basic or upgraded) for a player
  getActualChoice(userId, baseChoice) {
    const upgrades =
      userId === this.challenger.id
        ? this.challengerUpgrades
        : this.challengedUpgrades;

    if (upgrades[baseChoice]) {
      // Return upgraded version
      const upgradeMap = {
        rock: "wall",
        bomb: "cannon",
        scissors: "fire",
        paper: "clay",
      };
      return upgradeMap[baseChoice];
    }
    return baseChoice;
  }

  // Get display info for choices (emoji and name)
  getChoiceDisplay(choice) {
    const choiceInfo = {
      rock: { emoji: "🪨", name: "Rock" },
      paper: { emoji: "📄", name: "Paper" },
      scissors: { emoji: "✂️", name: "Scissors" },
      bomb: { emoji: "💣", name: "Bomb" },
      wall: { emoji: "🧱", name: "Wall" },
      cannon: { emoji: "🔫", name: "Cannon" },
      fire: { emoji: "🔥", name: "Fire" },
      clay: { emoji: "🏺", name: "Clay" },
    };
    return choiceInfo[choice] || { emoji: "❓", name: choice };
  }

  // Get detailed upgrade status for display
  getUpgradeStatus(userId) {
    const upgrades =
      userId === this.challenger.id
        ? this.challengerUpgrades
        : this.challengedUpgrades;
    const upgradeMap = {
      rock: "🧱Wall",
      bomb: "🔫Cannon",
      scissors: "🔥Fire",
      paper: "🏺Clay",
    };

    const upgradesList = Object.keys(upgrades)
      .filter((item) => upgrades[item])
      .map((item) => upgradeMap[item]);

    const count = upgradesList.length;
    if (count === 0) return `${count}/4 upgrades`;
    return `${count}/4 upgrades (${upgradesList.join(", ")})`;
  }

  getRoundWinner() {
    if (!this.bothPlayersReady()) return null;

    // Get actual choices (basic or upgraded)
    const challengerActual = this.getActualChoice(
      this.challenger.id,
      this.challengerChoice
    );
    const challengedActual = this.getActualChoice(
      this.challenged.id,
      this.challengedChoice
    );

    if (challengerActual === challengedActual) return "tie";

    // Complete win conditions including upgrades:
    // Basic: Rock beats scissors | Paper beats rock | Scissors beats paper and bomb | Bomb beats rock and paper
    // Upgrades: Wall beats scissors, bomb and fire | Cannon beats rock, paper, wall and clay | Fire beats paper, scissors and bomb | Clay beats rock, wall and fire
    const winConditions = {
      // Basic items
      rock: ["scissors"],
      paper: ["rock"],
      scissors: ["paper", "bomb"],
      bomb: ["rock", "paper"],
      // Upgraded items
      wall: ["scissors", "bomb", "fire"],
      cannon: ["rock", "paper", "wall", "clay"],
      fire: ["paper", "scissors", "bomb"],
      clay: ["rock", "wall", "fire"],
    };

    return winConditions[challengerActual].includes(challengedActual)
      ? "challenger"
      : "challenged";
  }

  processRoundResult() {
    const winner = this.getRoundWinner();

    if (winner === "tie") {
      this.ties++;
      this.resetRound();
      return { winner: "tie", gameComplete: false };
    } else if (winner === "challenger") {
      this.challengerWins++;
      this.gamePhase = "upgrading";
      this.pendingUpgrader = this.challenger.id;
      return { winner: "challenger", gameComplete: false };
    } else {
      this.challengedWins++;
      this.gamePhase = "upgrading";
      this.pendingUpgrader = this.challenged.id;
      return { winner: "challenged", gameComplete: false };
    }
  }
}

// Slash command definition
const commands = [
  new SlashCommandBuilder()
    .setName("rpc")
    .setDescription("Challenge someone to rock paper crane")
    .addUserOption((option) =>
      option
        .setName("opponent")
        .setDescription("The user you want to challenge")
        .setRequired(true)
    ),
];

client.once("ready", async () => {
  console.log(`✅ ${client.user.tag} is online and ready!`);

  // Register slash commands
  const rest = new REST({ version: "10" }).setToken(process.env.BOT_TOKEN);

  try {
    console.log("Started refreshing application (/) commands.");

    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), {
      body: commands,
    });

    console.log("Successfully reloaded application (/) commands.");
  } catch (error) {
    console.error("Error registering slash commands:", error);
  }
});

client.on("interactionCreate", async (interaction) => {
  if (interaction.isCommand()) {
    await handleSlashCommand(interaction);
  } else if (interaction.isButton()) {
    await handleButtonInteraction(interaction);
  }
});

async function handleSlashCommand(interaction) {
  if (interaction.commandName === "rpc") {
    const challenger = interaction.user;
    const challenged = interaction.options.getUser("opponent");
    const channel = interaction.channel;

    // Check if bot is in the channel
    if (!channel.members?.has(client.user.id)) {
      await interaction.reply({
        content: "❌ I need to be in this channel to facilitate the game!",
        ephemeral: true,
      });
      return;
    }

    // Check if challenging themselves
    if (challenger.id === challenged.id) {
      await interaction.reply({
        content: "❌ You cannot challenge yourself!",
        ephemeral: true,
      });
      return;
    }

    // Check if challenged user is a bot
    if (challenged.bot) {
      await interaction.reply({
        content: "❌ You cannot challenge a bot!",
        ephemeral: true,
      });
      return;
    }

    // Check if there's already an active game with these players
    const existingGame = Array.from(activeGames.values()).find(
      (game) =>
        (game.challenger.id === challenger.id &&
          game.challenged.id === challenged.id) ||
        (game.challenger.id === challenged.id &&
          game.challenged.id === challenger.id)
    );

    if (existingGame) {
      await interaction.reply({
        content: "❌ You already have an active game with this player!",
        ephemeral: true,
      });
      return;
    }

    // Create new game
    const game = new RPCGame(challenger, challenged, channel.id);
    activeGames.set(game.gameId, game);

    // Create challenge embed and buttons
    const challengeEmbed = new EmbedBuilder()
      .setTitle("🎮 Rock Paper Crane Challenge!")
      .setDescription(
        `${challenger} has challenged ${challenged} to a multi-round game of Rock Paper Crane!`
      )
      .setColor("#FF6B6B")
      .addFields({
        name: "How to play:",
        value:
          "• Click Accept to join the multi-round game\n• Each round: choose Rock, Paper, Scissors, or Bomb\n• **Round winner upgrades an item:** Rock→Wall, Bomb→Cannon, Scissors→Fire, Paper→Clay\n• **Upgraded items have new powers!**\n• **First to upgrade all 4 items wins the game!**",
      })
      .addFields({
        name: "Basic Rules:",
        value:
          "Rock beats Scissors | Paper beats Rock | Scissors beats Paper & Bomb | Bomb beats Rock & Paper",
        inline: false,
      })
      .addFields({
        name: "Upgrade Powers:",
        value:
          "🧱Wall beats Scissors, Bomb & Fire | 🔫Cannon beats Rock, Paper, Wall & Clay | 🔥Fire beats Paper, Scissors & Bomb | 🏺Clay beats Rock, Wall & Fire",
        inline: false,
      })
      .setFooter({ text: "The challenge will expire in 60 seconds" });

    const challengeButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`accept_${game.gameId}`)
        .setLabel("Accept Challenge")
        .setStyle(ButtonStyle.Success)
        .setEmoji("✅"),
      new ButtonBuilder()
        .setCustomId(`decline_${game.gameId}`)
        .setLabel("Decline Challenge")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("❌")
    );

    await interaction.reply({
      embeds: [challengeEmbed],
      components: [challengeButtons],
    });

    // Auto-expire challenge after 60 seconds
    setTimeout(() => {
      if (activeGames.has(game.gameId)) {
        activeGames.delete(game.gameId);
        interaction
          .editReply({
            embeds: [
              challengeEmbed.setDescription(
                `${challenger} challenged ${challenged} to Rock Paper Crane, but the challenge expired.`
              ),
            ],
            components: [],
          })
          .catch(() => {});
      }
    }, 60000);
  }
}

async function handleButtonInteraction(interaction) {
  const [action, gameId] = interaction.customId.split("_");
  const game = activeGames.get(gameId);

  if (!game) {
    await interaction.reply({
      content: "❌ This game is no longer active.",
      ephemeral: true,
    });
    return;
  }

  if (action === "accept" || action === "decline") {
    // Only the challenged player can accept/decline
    if (interaction.user.id !== game.challenged.id) {
      await interaction.reply({
        content: "❌ Only the challenged player can respond to this challenge.",
        ephemeral: true,
      });
      return;
    }

    if (action === "decline") {
      activeGames.delete(gameId);
      const declineEmbed = new EmbedBuilder()
        .setTitle("❌ Challenge Declined")
        .setDescription(`${game.challenged} declined the challenge.`)
        .setColor("#FF4444");

      await interaction.update({
        embeds: [declineEmbed],
        components: [],
      });
      return;
    }

    // Challenge accepted - start the game
    const gameEmbed = new EmbedBuilder()
      .setTitle("⚔️ Rock Paper Crane Game Started!")
      .setDescription(
        `${game.challenger} vs ${game.challenged}\n\n**Round ${game.currentRound}** - Make your choice!`
      )
      .setColor("#4CAF50")
      .addFields(
        {
          name: "Players:",
          value: `${game.challenger} - ⏳ Waiting...\n${game.challenged} - ⏳ Waiting...`,
          inline: false,
        },
        {
          name: "Upgrades Progress:",
          value: `${game.challenger}: ${game.getUpgradeStatus(
            game.challenger.id
          )}\n${game.challenged}: ${game.getUpgradeStatus(game.challenged.id)}`,
          inline: false,
        },
        {
          name: "Round Wins:",
          value: `${game.challenger}: ${game.challengerWins} | ${game.challenged}: ${game.challengedWins} | Ties: ${game.ties}`,
          inline: false,
        }
      );

    const gameButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`choice_${gameId}_rock`)
        .setLabel("Rock")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🪨"),
      new ButtonBuilder()
        .setCustomId(`choice_${gameId}_paper`)
        .setLabel("Paper")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📄"),
      new ButtonBuilder()
        .setCustomId(`choice_${gameId}_scissors`)
        .setLabel("Scissors")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✂️"),
      new ButtonBuilder()
        .setCustomId(`choice_${gameId}_bomb`)
        .setLabel("Bomb")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("💣")
    );

    await interaction.update({
      embeds: [gameEmbed],
      components: [gameButtons],
    });
  } else if (action === "choice") {
    const choice = interaction.customId.split("_")[2];

    // Check if user is part of this game
    if (
      interaction.user.id !== game.challenger.id &&
      interaction.user.id !== game.challenged.id
    ) {
      await interaction.reply({
        content: "❌ You are not part of this game!",
        ephemeral: true,
      });
      return;
    }

    // Check if game is in the right phase
    if (game.gamePhase !== "playing") {
      await interaction.reply({
        content: "❌ Game is not in playing phase!",
        ephemeral: true,
      });
      return;
    }

    // Check if user already made a choice
    if (
      (interaction.user.id === game.challenger.id && game.challengerChoice) ||
      (interaction.user.id === game.challenged.id && game.challengedChoice)
    ) {
      await interaction.reply({
        content: "❌ You have already made your choice!",
        ephemeral: true,
      });
      return;
    }

    // Record the choice
    game.makeChoice(interaction.user.id, choice);

    await interaction.reply({
      content: `✅ You chose **${choice}**! Waiting for the other player...`,
      ephemeral: true,
    });

    // Update the game embed to show who has made their choice
    const challengerStatus = game.challengerChoice
      ? "✅ Ready!"
      : "⏳ Waiting...";
    const challengedStatus = game.challengedChoice
      ? "✅ Ready!"
      : "⏳ Waiting...";

    const updatedEmbed = new EmbedBuilder()
      .setTitle("⚔️ Rock Paper Crane Game Started!")
      .setDescription(
        `${game.challenger} vs ${game.challenged}\n\n**Round ${game.currentRound}** - Make your choice!`
      )
      .setColor("#4CAF50")
      .addFields(
        {
          name: "Players:",
          value: `${game.challenger} - ${challengerStatus}\n${game.challenged} - ${challengedStatus}`,
          inline: false,
        },
        {
          name: "Upgrades Progress:",
          value: `${game.challenger}: ${game.getUpgradeCount(
            game.challenger.id
          )}/4 upgrades\n${game.challenged}: ${game.getUpgradeCount(
            game.challenged.id
          )}/4 upgrades`,
          inline: false,
        },
        {
          name: "Round Wins:",
          value: `${game.challenger}: ${game.challengerWins} | ${game.challenged}: ${game.challengedWins} | Ties: ${game.ties}`,
          inline: false,
        }
      );

    // Check if both players have made their choices
    if (game.bothPlayersReady()) {
      // Process round result
      const roundResult = game.processRoundResult();
      const roundWinner = game.getRoundWinner();

      // Get actual choices (basic or upgraded) for display
      const challengerActual = game.getActualChoice(
        game.challenger.id,
        game.challengerChoice
      );
      const challengedActual = game.getActualChoice(
        game.challenged.id,
        game.challengedChoice
      );

      const challengerDisplay = game.getChoiceDisplay(challengerActual);
      const challengedDisplay = game.getChoiceDisplay(challengedActual);

      const resultsText = `${game.challenger} chose ${challengerDisplay.emoji} **${challengerDisplay.name}**\n${game.challenged} chose ${challengedDisplay.emoji} **${challengedDisplay.name}**`;

      let resultDescription = "";
      let resultColor = "";
      let resultTitle = "";

      if (roundWinner === "tie") {
        resultTitle = `🤝 Round ${game.currentRound - 1} - It's a Tie!`;
        resultDescription = `${resultsText}\n\nNo upgrades awarded. Starting next round...`;
        resultColor = "#FFA500";
      } else {
        const winnerUser =
          roundWinner === "challenger" ? game.challenger : game.challenged;
        resultTitle = `🎉 Round ${game.currentRound - 1} Winner!`;
        resultDescription = `${resultsText}\n\n**${winnerUser}** wins the round! 🏆\n\nSelect an item to upgrade:`;
        resultColor = "#00FF00";
      }

      const resultEmbed = new EmbedBuilder()
        .setTitle(resultTitle)
        .setDescription(resultDescription)
        .setColor(resultColor);

      // Add current game status
      resultEmbed.addFields(
        {
          name: "Game Status:",
          value: `Round Wins - ${game.challenger}: ${game.challengerWins} | ${game.challenged}: ${game.challengedWins} | Ties: ${game.ties}`,
          inline: false,
        },
        {
          name: "Upgrades:",
          value: `${game.challenger}: ${game.getUpgradeCount(
            game.challenger.id
          )}/4 | ${game.challenged}: ${game.getUpgradeCount(
            game.challenged.id
          )}/4`,
          inline: false,
        }
      );

      if (roundWinner === "tie") {
        // Show next round buttons
        const nextRoundButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`choice_${gameId}_rock`)
            .setLabel("Rock")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("🪨"),
          new ButtonBuilder()
            .setCustomId(`choice_${gameId}_paper`)
            .setLabel("Paper")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("📄"),
          new ButtonBuilder()
            .setCustomId(`choice_${gameId}_scissors`)
            .setLabel("Scissors")
            .setStyle(ButtonStyle.Secondary)
            .setEmoji("✂️"),
          new ButtonBuilder()
            .setCustomId(`choice_${gameId}_bomb`)
            .setLabel("Bomb")
            .setStyle(ButtonStyle.Danger)
            .setEmoji("💣")
        );

        resultEmbed.setDescription(
          resultDescription +
            `\n\n**Round ${game.currentRound}** - Make your choice!`
        );

        await interaction.editReply({
          embeds: [resultEmbed],
          components: [nextRoundButtons],
        });
      } else {
        // Show upgrade buttons to the winner
        const winnerId =
          roundWinner === "challenger"
            ? game.challenger.id
            : game.challenged.id;
        const availableUpgrades = game.getAvailableUpgrades(winnerId);

        if (availableUpgrades.length === 0) {
          // Winner has all upgrades - game over!
          const gameWinnerUser =
            roundWinner === "challenger" ? game.challenger : game.challenged;
          const finalEmbed = new EmbedBuilder()
            .setTitle("🎊 GAME COMPLETE! 🎊")
            .setDescription(
              `**${gameWinnerUser}** has upgraded all 4 items and wins the entire game!`
            )
            .setColor("#FFD700");

          const newGameButton = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId(
                `newgame_${game.challenger.id}_${game.challenged.id}`
              )
              .setLabel("Play Again")
              .setStyle(ButtonStyle.Primary)
              .setEmoji("🔄")
          );

          await interaction.editReply({
            embeds: [finalEmbed],
            components: [newGameButton],
          });

          // Clean up the game
          activeGames.delete(gameId);
        } else {
          // Show upgrade options
          const upgradeButtons = new ActionRowBuilder();

          const upgradeMap = {
            rock: { to: "wall", emoji: "🧱" },
            bomb: { to: "cannon", emoji: "🔫" },
            scissors: { to: "fire", emoji: "🔥" },
            paper: { to: "clay", emoji: "🏺" },
          };

          availableUpgrades.forEach((item) => {
            const upgrade = upgradeMap[item];
            upgradeButtons.addComponents(
              new ButtonBuilder()
                .setCustomId(`upgrade_${gameId}_${item}`)
                .setLabel(`${item} → ${upgrade.to}`)
                .setStyle(ButtonStyle.Primary)
                .setEmoji(upgrade.emoji)
            );
          });

          await interaction.editReply({
            embeds: [resultEmbed],
            components: [upgradeButtons],
          });
        }
      }
    } else {
      // Update the embed to show current status
      const gameButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`choice_${gameId}_rock`)
          .setLabel("Rock")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("🪨"),
        new ButtonBuilder()
          .setCustomId(`choice_${gameId}_paper`)
          .setLabel("Paper")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("📄"),
        new ButtonBuilder()
          .setCustomId(`choice_${gameId}_scissors`)
          .setLabel("Scissors")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("✂️"),
        new ButtonBuilder()
          .setCustomId(`choice_${gameId}_bomb`)
          .setLabel("Bomb")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("💣")
      );

      await interaction.editReply({
        embeds: [updatedEmbed],
        components: [gameButtons],
      });
    }
  } else if (action === "upgrade") {
    const item = interaction.customId.split("_")[2];

    // Check if user is the one who should be upgrading
    if (interaction.user.id !== game.pendingUpgrader) {
      await interaction.reply({
        content: "❌ It's not your turn to upgrade!",
        ephemeral: true,
      });
      return;
    }

    // Check if game is in upgrading phase
    if (game.gamePhase !== "upgrading") {
      await interaction.reply({
        content: "❌ Game is not in upgrade phase!",
        ephemeral: true,
      });
      return;
    }

    // Check if the item can be upgraded
    const availableUpgrades = game.getAvailableUpgrades(interaction.user.id);
    if (!availableUpgrades.includes(item)) {
      await interaction.reply({
        content: "❌ This item is already upgraded or invalid!",
        ephemeral: true,
      });
      return;
    }

    // Make the upgrade
    game.makeUpgrade(interaction.user.id, item);

    const upgradeMap = {
      rock: { from: "🪨 Rock", to: "🧱 Wall" },
      bomb: { from: "💣 Bomb", to: "🔫 Cannon" },
      scissors: { from: "✂️ Scissors", to: "🔥 Fire" },
      paper: { from: "📄 Paper", to: "🏺 Clay" },
    };

    const upgrade = upgradeMap[item];
    await interaction.reply({
      content: `✅ You upgraded your ${upgrade.from} to ${upgrade.to}!`,
      ephemeral: true,
    });

    // Check if game is complete
    if (game.gamePhase === "completed") {
      const finalEmbed = new EmbedBuilder()
        .setTitle("🎊 GAME COMPLETE! 🎊")
        .setDescription(
          `**${interaction.user}** has upgraded all 4 items and wins the entire game!`
        )
        .setColor("#FFD700")
        .addFields({
          name: "Final Stats:",
          value: `Round Wins - ${game.challenger}: ${game.challengerWins} | ${game.challenged}: ${game.challengedWins} | Ties: ${game.ties}`,
          inline: false,
        });

      const newGameButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`newgame_${game.challenger.id}_${game.challenged.id}`)
          .setLabel("Play Again")
          .setStyle(ButtonStyle.Primary)
          .setEmoji("🔄")
      );

      await interaction.editReply({
        embeds: [finalEmbed],
        components: [newGameButton],
      });

      // Clean up the game
      activeGames.delete(gameId);
    } else {
      // Continue to next round
      const nextRoundEmbed = new EmbedBuilder()
        .setTitle("⚔️ Next Round!")
        .setDescription(
          `${game.challenger} vs ${game.challenged}\n\n**Round ${game.currentRound}** - Make your choice!`
        )
        .setColor("#4CAF50")
        .addFields(
          {
            name: "Upgrades Progress:",
            value: `${game.challenger}: ${game.getUpgradeCount(
              game.challenger.id
            )}/4 upgrades\n${game.challenged}: ${game.getUpgradeCount(
              game.challenged.id
            )}/4 upgrades`,
            inline: false,
          },
          {
            name: "Round Wins:",
            value: `${game.challenger}: ${game.challengerWins} | ${game.challenged}: ${game.challengedWins} | Ties: ${game.ties}`,
            inline: false,
          }
        );

      const nextRoundButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`choice_${gameId}_rock`)
          .setLabel("Rock")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("🪨"),
        new ButtonBuilder()
          .setCustomId(`choice_${gameId}_paper`)
          .setLabel("Paper")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("📄"),
        new ButtonBuilder()
          .setCustomId(`choice_${gameId}_scissors`)
          .setLabel("Scissors")
          .setStyle(ButtonStyle.Secondary)
          .setEmoji("✂️"),
        new ButtonBuilder()
          .setCustomId(`choice_${gameId}_bomb`)
          .setLabel("Bomb")
          .setStyle(ButtonStyle.Danger)
          .setEmoji("💣")
      );

      await interaction.editReply({
        embeds: [nextRoundEmbed],
        components: [nextRoundButtons],
      });
    }
  } else if (action === "newgame") {
    const [, challengerId, challengedId] = interaction.customId.split("_");

    // Only the original players can start a new game
    if (
      interaction.user.id !== challengerId &&
      interaction.user.id !== challengedId
    ) {
      await interaction.reply({
        content: "❌ Only the original players can start a new game!",
        ephemeral: true,
      });
      return;
    }

    // Get the users for the new game
    const challenger = interaction.user;
    const challengedUser =
      interaction.user.id === challengerId
        ? await client.users.fetch(challengedId)
        : await client.users.fetch(challengerId);

    // Create new game
    const newGame = new RPCGame(
      challenger,
      challengedUser,
      interaction.channel.id
    );
    activeGames.set(newGame.gameId, newGame);

    const gameEmbed = new EmbedBuilder()
      .setTitle("⚔️ New Rock Paper Crane Game!")
      .setDescription(
        `${challenger} started a new game with ${challengedUser}!\n\nBoth players, make your choice! Your choices will be revealed once both players have decided.`
      )
      .setColor("#4CAF50")
      .addFields({
        name: "Players:",
        value: `${challenger} - ⏳ Waiting...\n${challengedUser} - ⏳ Waiting...`,
        inline: false,
      });

    const gameButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`choice_${newGame.gameId}_rock`)
        .setLabel("Rock")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("🪨"),
      new ButtonBuilder()
        .setCustomId(`choice_${newGame.gameId}_paper`)
        .setLabel("Paper")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("📄"),
      new ButtonBuilder()
        .setCustomId(`choice_${newGame.gameId}_scissors`)
        .setLabel("Scissors")
        .setStyle(ButtonStyle.Secondary)
        .setEmoji("✂️"),
      new ButtonBuilder()
        .setCustomId(`choice_${newGame.gameId}_bomb`)
        .setLabel("Bomb")
        .setStyle(ButtonStyle.Danger)
        .setEmoji("💣")
    );

    await interaction.update({
      embeds: [gameEmbed],
      components: [gameButtons],
    });
  }
}

// Error handling
client.on("error", console.error);

process.on("unhandledRejection", (error) => {
  console.error("Unhandled promise rejection:", error);
});

// Login to Discord
client.login(process.env.BOT_TOKEN);
