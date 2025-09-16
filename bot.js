const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, SlashCommandBuilder, REST, Routes } = require('discord.js');
require('dotenv').config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions
    ]
});

// Store active games
const activeGames = new Map();

// Game class to manage individual rock paper scissors games
class RPSGame {
    constructor(challenger, challenged, channelId) {
        this.challenger = challenger;
        this.challenged = challenged;
        this.channelId = channelId;
        this.challengerChoice = null;
        this.challengedChoice = null;
        this.gameId = `${challenger.id}-${challenged.id}-${Date.now()}`;
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

    getWinner() {
        if (!this.bothPlayersReady()) return null;

        const challenger = this.challengerChoice;
        const challenged = this.challengedChoice;

        if (challenger === challenged) return 'tie';

        const winConditions = {
            'rock': 'scissors',
            'paper': 'rock',
            'scissors': 'paper'
        };

        return winConditions[challenger] === challenged ? 'challenger' : 'challenged';
    }
}

// Slash command definition
const commands = [
    new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Challenge someone to rock paper scissors')
        .addUserOption(option =>
            option.setName('opponent')
                .setDescription('The user you want to challenge')
                .setRequired(true))
];

client.once('ready', async () => {
    console.log(`✅ ${client.user.tag} is online and ready!`);
    
    // Register slash commands
    const rest = new REST({ version: '10' }).setToken(process.env.BOT_TOKEN);
    
    try {
        console.log('Started refreshing application (/) commands.');
        
        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID),
            { body: commands }
        );
        
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
});

client.on('interactionCreate', async interaction => {
    if (interaction.isCommand()) {
        await handleSlashCommand(interaction);
    } else if (interaction.isButton()) {
        await handleButtonInteraction(interaction);
    }
});

async function handleSlashCommand(interaction) {
    if (interaction.commandName === 'rps') {
        const challenger = interaction.user;
        const challenged = interaction.options.getUser('opponent');
        const channel = interaction.channel;

        // Check if bot is in the channel
        if (!channel.members?.has(client.user.id)) {
            await interaction.reply({
                content: '❌ I need to be in this channel to facilitate the game!',
                ephemeral: true
            });
            return;
        }

        // Check if challenging themselves
        if (challenger.id === challenged.id) {
            await interaction.reply({
                content: '❌ You cannot challenge yourself!',
                ephemeral: true
            });
            return;
        }

        // Check if challenged user is a bot
        if (challenged.bot) {
            await interaction.reply({
                content: '❌ You cannot challenge a bot!',
                ephemeral: true
            });
            return;
        }

        // Check if there's already an active game with these players
        const existingGame = Array.from(activeGames.values()).find(game => 
            (game.challenger.id === challenger.id && game.challenged.id === challenged.id) ||
            (game.challenger.id === challenged.id && game.challenged.id === challenger.id)
        );

        if (existingGame) {
            await interaction.reply({
                content: '❌ You already have an active game with this player!',
                ephemeral: true
            });
            return;
        }

        // Create new game
        const game = new RPSGame(challenger, challenged, channel.id);
        activeGames.set(game.gameId, game);

        // Create challenge embed and buttons
        const challengeEmbed = new EmbedBuilder()
            .setTitle('🎮 Rock Paper Scissors Challenge!')
            .setDescription(`${challenger} has challenged ${challenged} to a game of Rock Paper Scissors!`)
            .setColor('#FF6B6B')
            .addFields(
                { name: 'How to play:', value: '• Click Accept to join the game\n• Click Decline to reject the challenge\n• Both players must make their choice\n• Choices are revealed simultaneously!' }
            )
            .setFooter({ text: 'The challenge will expire in 60 seconds' });

        const challengeButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`accept_${game.gameId}`)
                    .setLabel('Accept Challenge')
                    .setStyle(ButtonStyle.Success)
                    .setEmoji('✅'),
                new ButtonBuilder()
                    .setCustomId(`decline_${game.gameId}`)
                    .setLabel('Decline Challenge')
                    .setStyle(ButtonStyle.Danger)
                    .setEmoji('❌')
            );

        await interaction.reply({
            embeds: [challengeEmbed],
            components: [challengeButtons]
        });

        // Auto-expire challenge after 60 seconds
        setTimeout(() => {
            if (activeGames.has(game.gameId)) {
                activeGames.delete(game.gameId);
                interaction.editReply({
                    embeds: [challengeEmbed.setDescription(`${challenger} challenged ${challenged} to Rock Paper Scissors, but the challenge expired.`)],
                    components: []
                }).catch(() => {});
            }
        }, 60000);
    }
}

async function handleButtonInteraction(interaction) {
    const [action, gameId] = interaction.customId.split('_');
    const game = activeGames.get(gameId);

    if (!game) {
        await interaction.reply({
            content: '❌ This game is no longer active.',
            ephemeral: true
        });
        return;
    }

    if (action === 'accept' || action === 'decline') {
        // Only the challenged player can accept/decline
        if (interaction.user.id !== game.challenged.id) {
            await interaction.reply({
                content: '❌ Only the challenged player can respond to this challenge.',
                ephemeral: true
            });
            return;
        }

        if (action === 'decline') {
            activeGames.delete(gameId);
            const declineEmbed = new EmbedBuilder()
                .setTitle('❌ Challenge Declined')
                .setDescription(`${game.challenged} declined the challenge.`)
                .setColor('#FF4444');

            await interaction.update({
                embeds: [declineEmbed],
                components: []
            });
            return;
        }

        // Challenge accepted - start the game
        const gameEmbed = new EmbedBuilder()
            .setTitle('⚔️ Rock Paper Scissors Game Started!')
            .setDescription(`${game.challenger} vs ${game.challenged}\n\nBoth players, make your choice! Your choices will be revealed once both players have decided.`)
            .setColor('#4CAF50')
            .addFields(
                { name: 'Players:', value: `${game.challenger} - ⏳ Waiting...\n${game.challenged} - ⏳ Waiting...`, inline: false }
            );

        const gameButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`choice_${gameId}_rock`)
                    .setLabel('Rock')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🪨'),
                new ButtonBuilder()
                    .setCustomId(`choice_${gameId}_paper`)
                    .setLabel('Paper')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📄'),
                new ButtonBuilder()
                    .setCustomId(`choice_${gameId}_scissors`)
                    .setLabel('Scissors')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✂️')
            );

        await interaction.update({
            embeds: [gameEmbed],
            components: [gameButtons]
        });
    } else if (action === 'choice') {
        const choice = interaction.customId.split('_')[2];
        
        // Check if user is part of this game
        if (interaction.user.id !== game.challenger.id && interaction.user.id !== game.challenged.id) {
            await interaction.reply({
                content: '❌ You are not part of this game!',
                ephemeral: true
            });
            return;
        }

        // Check if user already made a choice
        if ((interaction.user.id === game.challenger.id && game.challengerChoice) ||
            (interaction.user.id === game.challenged.id && game.challengedChoice)) {
            await interaction.reply({
                content: '❌ You have already made your choice!',
                ephemeral: true
            });
            return;
        }

        // Record the choice
        game.makeChoice(interaction.user.id, choice);

        await interaction.reply({
            content: `✅ You chose **${choice}**! Waiting for the other player...`,
            ephemeral: true
        });

        // Update the game embed to show who has made their choice
        const challengerStatus = game.challengerChoice ? '✅ Ready!' : '⏳ Waiting...';
        const challengedStatus = game.challengedChoice ? '✅ Ready!' : '⏳ Waiting...';

        const updatedEmbed = new EmbedBuilder()
            .setTitle('⚔️ Rock Paper Scissors Game Started!')
            .setDescription(`${game.challenger} vs ${game.challenged}\n\nBoth players, make your choice! Your choices will be revealed once both players have decided.`)
            .setColor('#4CAF50')
            .addFields(
                { name: 'Players:', value: `${game.challenger} - ${challengerStatus}\n${game.challenged} - ${challengedStatus}`, inline: false }
            );

        // Check if both players have made their choices
        if (game.bothPlayersReady()) {
            // Game is complete - show results
            const winner = game.getWinner();
            let resultDescription = '';
            let resultColor = '';
            let resultTitle = '';

            const choiceEmojis = {
                'rock': '🪨',
                'paper': '📄',
                'scissors': '✂️'
            };

            const resultsText = `${game.challenger} chose ${choiceEmojis[game.challengerChoice]} **${game.challengerChoice}**\n${game.challenged} chose ${choiceEmojis[game.challengedChoice]} **${game.challengedChoice}**`;

            if (winner === 'tie') {
                resultTitle = '🤝 It\'s a Tie!';
                resultDescription = `${resultsText}\n\nIt's a draw! Both players chose the same thing.`;
                resultColor = '#FFA500';
            } else if (winner === 'challenger') {
                resultTitle = '🎉 We Have a Winner!';
                resultDescription = `${resultsText}\n\n**${game.challenger}** wins! 🏆`;
                resultColor = '#00FF00';
            } else {
                resultTitle = '🎉 We Have a Winner!';
                resultDescription = `${resultsText}\n\n**${game.challenged}** wins! 🏆`;
                resultColor = '#00FF00';
            }

            const resultEmbed = new EmbedBuilder()
                .setTitle(resultTitle)
                .setDescription(resultDescription)
                .setColor(resultColor);

            // Create new game button
            const newGameButton = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`newgame_${game.challenger.id}_${game.challenged.id}`)
                        .setLabel('Play Again')
                        .setStyle(ButtonStyle.Primary)
                        .setEmoji('🔄')
                );

            await interaction.editReply({
                embeds: [resultEmbed],
                components: [newGameButton]
            });

            // Clean up the game
            activeGames.delete(gameId);
        } else {
            // Update the embed to show current status
            const gameButtons = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`choice_${gameId}_rock`)
                        .setLabel('Rock')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('🪨'),
                    new ButtonBuilder()
                        .setCustomId(`choice_${gameId}_paper`)
                        .setLabel('Paper')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('📄'),
                    new ButtonBuilder()
                        .setCustomId(`choice_${gameId}_scissors`)
                        .setLabel('Scissors')
                        .setStyle(ButtonStyle.Secondary)
                        .setEmoji('✂️')
                );

            await interaction.editReply({
                embeds: [updatedEmbed],
                components: [gameButtons]
            });
        }
    } else if (action === 'newgame') {
        const [, challengerId, challengedId] = interaction.customId.split('_');
        
        // Only the original players can start a new game
        if (interaction.user.id !== challengerId && interaction.user.id !== challengedId) {
            await interaction.reply({
                content: '❌ Only the original players can start a new game!',
                ephemeral: true
            });
            return;
        }

        // Get the users for the new game
        const challenger = interaction.user;
        const challengedUser = interaction.user.id === challengerId 
            ? await client.users.fetch(challengedId)
            : await client.users.fetch(challengerId);

        // Create new game
        const newGame = new RPSGame(challenger, challengedUser, interaction.channel.id);
        activeGames.set(newGame.gameId, newGame);

        const gameEmbed = new EmbedBuilder()
            .setTitle('⚔️ New Rock Paper Scissors Game!')
            .setDescription(`${challenger} started a new game with ${challengedUser}!\n\nBoth players, make your choice! Your choices will be revealed once both players have decided.`)
            .setColor('#4CAF50')
            .addFields(
                { name: 'Players:', value: `${challenger} - ⏳ Waiting...\n${challengedUser} - ⏳ Waiting...`, inline: false }
            );

        const gameButtons = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId(`choice_${newGame.gameId}_rock`)
                    .setLabel('Rock')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('🪨'),
                new ButtonBuilder()
                    .setCustomId(`choice_${newGame.gameId}_paper`)
                    .setLabel('Paper')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('📄'),
                new ButtonBuilder()
                    .setCustomId(`choice_${newGame.gameId}_scissors`)
                    .setLabel('Scissors')
                    .setStyle(ButtonStyle.Secondary)
                    .setEmoji('✂️')
            );

        await interaction.update({
            embeds: [gameEmbed],
            components: [gameButtons]
        });
    }
}

// Error handling
client.on('error', console.error);

process.on('unhandledRejection', (error) => {
    console.error('Unhandled promise rejection:', error);
});

// Login to Discord
client.login(process.env.BOT_TOKEN);
