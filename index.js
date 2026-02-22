/**
 * Minecraft Server Status Bot
 * Created by Team BLK
 * 
 * YouTube: https://www.youtube.com/@team_blk_official
 * Discord: adithyadev.blk
 * GitHub: https://github.com/BLKOFFICIAL
 */

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActivityType, AttachmentBuilder } = require('discord.js');
const util = require('minecraft-server-util');
const config = require('./config.json');
const express = require('express');
const chalk = require('chalk');
const { createCanvas } = require('canvas');
const { Chart } = require('chart.js/auto');
const fs = require('fs');
const path = require('path');
const app = express();

// Initialize Discord client with intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
    ]
});

// Store server status messages and intervals
const statusMessages = new Map();
const updateIntervals = new Map();
const playerHistory = new Map(); // Store player count history

// Fancy console logging
const log = {
    info: (msg) => console.log(chalk.blue('ℹ️ [INFO]'), msg),
    success: (msg) => console.log(chalk.green('✅ [SUCCESS]'), msg),
    error: (msg) => console.log(chalk.red('❌ [ERROR]'), msg),
    warn: (msg) => console.log(chalk.yellow('⚠️ [WARN]'), msg)
};

// Save message ID to config
function saveMessageId(channelId, messageId) {
    const server = config.minecraft.servers.find(s => s.channelId === channelId);
    if (server) {
        server.messageId = messageId;
        fs.writeFileSync('./config.json', JSON.stringify(config, null, 4));
        log.info(`Saved message ID ${messageId} for channel ${channelId}`);
    }
}

// Clean up old messages
async function cleanupOldMessages(channel) {
    try {
        const messages = await channel.messages.fetch({ limit: 2 });
        await channel.bulkDelete(messages);
        log.info(`Cleaned up old messages in channel ${channel.id}`);
    } catch (error) {
        log.error(`Failed to cleanup messages in channel ${channel.id}: ${error.message}`);
    }
}

// Initialize player history for a server
function initializePlayerHistory(serverId) {
    if (!playerHistory.has(serverId)) {
        playerHistory.set(serverId, []);
    }
}

// Add player count to history
function updatePlayerHistory(serverId, playerCount, maxHistory = 24) {
    const history = playerHistory.get(serverId) || [];
    const currentTime = Date.now();
    
    // If history is empty or it's been 5 minutes since last record
    // This will create more frequent records initially until we have enough data
    const timeBetweenRecords = history.length < 24 ? 300000 : 3600000; // 5 minutes or 1 hour
    
    if (history.length === 0 || 
        (currentTime - history[history.length - 1].timestamp) >= timeBetweenRecords) {
        history.push({
            timestamp: currentTime,
            count: playerCount
        });

        // Keep only last 24 records
        if (history.length > maxHistory) {
            history.shift(); // Remove oldest record
        }

        playerHistory.set(serverId, history);
        log.info(`Updated player history for ${serverId} (${history.length} records)`);
    } else {
        // Update the latest record
        history[history.length - 1].count = playerCount;
        playerHistory.set(serverId, history);
    }
}

// Generate player count chart
async function generatePlayerChart(serverId, color = '#3498db') {
    const history = playerHistory.get(serverId) || [];
    if (history.length < 2) {
        log.warn(`Not enough history data for chart (${history.length} records)`);
        return null;
    }

    const width = 800;
    const height = 400;
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // Set background
    ctx.fillStyle = '#2F3136';
    ctx.fillRect(0, 0, width, height);

    const labels = history.map(entry => {
        const date = new Date(entry.timestamp);
        return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    });

    const data = history.map(entry => entry.count);

    new Chart(ctx, {
        type: 'line',
        data: {
            labels,
            datasets: [{
                label: 'Player Count',
                data,
                borderColor: color,
                backgroundColor: color + '33', // Add transparency
                borderWidth: 2,
                tension: 0.4,
                fill: true,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: false,
            animation: false, // Disable animations for static image
            plugins: {
                legend: {
                    labels: {
                        color: '#FFFFFF',
                        font: {
                            size: 14
                        }
                    }
                },
                title: {
                    display: true,
                    text: 'Player Count History',
                    color: '#FFFFFF',
                    font: {
                        size: 16,
                        weight: 'bold'
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    grid: {
                        color: '#666666',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#FFFFFF',
                        font: {
                            size: 12
                        },
                        padding: 10
                    }
                },
                x: {
                    grid: {
                        color: '#666666',
                        drawBorder: false
                    },
                    ticks: {
                        color: '#FFFFFF',
                        font: {
                            size: 12
                        },
                        maxRotation: 45,
                        minRotation: 45
                    }
                }
            },
            layout: {
                padding: 20
            }
        }
    });

    return canvas.toBuffer('image/png');
}

// Bot ready event
client.once('ready', () => {
    log.success(`Logged in as ${client.user.tag}`);
    
    // Set custom presence from config
    const presence = config.bot.presence;
    client.user.setPresence({
        status: presence.status,
activities: presence.activities.map(activity => ({
    name: activity.name,
    type: activity.type
}))

    });

    // Initialize status updates for all configured servers
    initializeStatusUpdates();
});

async function checkServerStatus(ip, port = 25565) {
    try {
        const result = await util.status(ip, port);
        return {
            online: true,
            players: result.players.online,
            maxPlayers: result.players.max,
            version: result.version.name,
            description: result.motd.clean,
            ping: result.roundTripLatency
        };
    } catch (error) {
        log.error(`Failed to check status for ${ip}:${port} - ${error.message}`);
        return {
            online: false,
            error: error.message
        };
    }
}

async function updateServerStatus(serverConfig) {
    const channel = await client.channels.fetch(serverConfig.channelId).catch(() => null);
    if (!channel) {
        log.error(`Channel ${serverConfig.channelId} not found for server ${serverConfig.name}`);
        return;
    }

    const status = await checkServerStatus(serverConfig.ip, serverConfig.port);
    
    // Update player history if server is online
    if (status.online) {
        initializePlayerHistory(serverConfig.channelId);
        updatePlayerHistory(serverConfig.channelId, status.players, serverConfig.display.chart.historyHours);
    }

    const embed = new EmbedBuilder()
        .setTitle(config.embed.title)
        .setColor(status.online ? config.embed.colors.online : config.embed.colors.offline)
        .setTimestamp();

    // Add server info fields
    embed.addFields(
        { name: '📡 Server', value: `${serverConfig.name} (${serverConfig.ip}:${serverConfig.port})`, inline: true },
        { name: '🔌 Status', value: status.online ? '✅ Online' : '❌ Offline', inline: true }
    );

    if (status.online) {
        embed.addFields(
            { name: '👥 Players', value: `${status.players}/${status.maxPlayers}`, inline: true },
            { name: '🏷️ Version', value: status.version, inline: true },
            { name: '📊 Ping', value: `${status.ping}ms`, inline: true },
            { name: '📝 MOTD', value: status.description || 'No description available' }
        );

        if (serverConfig.display.showNextUpdate) {
            const nextUpdate = Math.floor((Date.now() + serverConfig.updateInterval) / 1000);
            embed.addFields({
                name: '⏱️ Next Update',
                value: `<t:${nextUpdate}:R>`,
                inline: true
            });
        }
    } else {
        embed.addFields(
            { name: '❌ Error', value: status.error || 'Could not connect to server' }
        );
    }

    embed.setFooter(config.embed.footer);

    const files = [];
    
    // Handle display type and images
    if (serverConfig.display.type === 'chart' && serverConfig.display.chart.enabled && status.online) {
        try {
            const chartBuffer = await generatePlayerChart(
                serverConfig.channelId,
                serverConfig.display.chart.color
            );
            if (chartBuffer) {
                const attachment = new AttachmentBuilder(chartBuffer, { name: 'player-chart.png' });
                files.push(attachment);
                embed.setImage('attachment://player-chart.png');
                log.info('Added chart to message');
            }
        } catch (error) {
            log.error(`Failed to generate player chart: ${error.message}`);
        }
    } else if (serverConfig.display.type === 'banner' && serverConfig.display.banner.enabled) {
        try {
            embed.setImage(serverConfig.display.banner.url);
            log.info('Added banner to message');
        } catch (error) {
            log.error(`Failed to set banner image: ${error.message}`);
        }
    }

    try {
        let message;
        
        // Try to fetch existing message
        if (serverConfig.messageId) {
            try {
                message = await channel.messages.fetch(serverConfig.messageId);
            } catch (error) {
                log.warn(`Could not find message ${serverConfig.messageId}, will create new one`);
                await cleanupOldMessages(channel);
            }
        }

        // If message exists, edit it, otherwise create new one
        if (message) {
            await message.edit({ embeds: [embed], files });
        } else {
            message = await channel.send({ embeds: [embed], files });
            saveMessageId(serverConfig.channelId, message.id);
        }

        statusMessages.set(serverConfig.channelId, message);
        log.info(`Updated status for ${serverConfig.name}`);
    } catch (error) {
        log.error(`Failed to update status message for ${serverConfig.name} - ${error.message}`);
    }
}

function initializeStatusUpdates() {
    // Clear any existing intervals
    for (const interval of updateIntervals.values()) {
        clearInterval(interval);
    }
    updateIntervals.clear();

    // Set up new intervals for each server
    for (const server of config.minecraft.servers) {
        // Initial update
        updateServerStatus(server);
        
        // Set up periodic updates
        const interval = setInterval(() => updateServerStatus(server), server.updateInterval);
        updateIntervals.set(server.channelId, interval);
        
        log.info(`Initialized status updates for ${server.name} (${server.ip}:${server.port})`);
    }
}

// Status command handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isCommand()) return;

    if (interaction.commandName === 'status') {
        const serverName = interaction.options.getString('server');
        const server = config.minecraft.servers.find(s => s.name.toLowerCase() === serverName.toLowerCase());
        
        if (!server) {
            await interaction.reply({
                content: `Server "${serverName}" not found in configuration!`,
                ephemeral: true
            });
            return;
        }

        const status = await checkServerStatus(server.ip, server.port);
        const embed = new EmbedBuilder()
            .setTitle(`${server.name} Status`)
            .setColor(status.online ? config.embed.colors.online : config.embed.colors.offline)
            .setTimestamp()
            .setFooter(config.embed.footer);

        if (status.online) {
            embed.addFields(
                { name: '🔌 Status', value: '✅ Online', inline: true },
                { name: '👥 Players', value: `${status.players}/${status.maxPlayers}`, inline: true },
                { name: '📊 Ping', value: `${status.ping}ms`, inline: true },
                { name: '🏷️ Version', value: status.version }
            );

            if (server.display.showNextUpdate) {
                const nextUpdate = Math.floor((Date.now() + server.updateInterval) / 1000);
                embed.addFields({
                    name: '⏱️ Next Update',
                    value: `<t:${nextUpdate}:R>`,
                    inline: true
                });
            }
        } else {
            embed.addFields(
                { name: '🔌 Status', value: '❌ Offline', inline: true },
                { name: '❌ Error', value: status.error || 'Could not connect to server' }
            );
        }

        const files = [];
        if (server.display.type === 'chart' && server.display.chart.enabled && status.online) {
            try {
                const chartBuffer = await generatePlayerChart(
                    server.channelId,
                    server.display.chart.color
                );
                if (chartBuffer) {
                    const attachment = new AttachmentBuilder(chartBuffer, { name: 'player-chart.png' });
                    files.push(attachment);
                    embed.setImage('attachment://player-chart.png');
                }
            } catch (error) {
                log.error(`Failed to generate player chart: ${error.message}`);
            }
        } else if (server.display.type === 'banner' && server.display.banner.enabled) {
            embed.setImage(server.display.banner.url);
        }

        await interaction.reply({
            embeds: [embed],
            files,
            ephemeral: true
        });
    }
});

// Serve static files
app.use(express.static(path.join(__dirname)));

// Express routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'uptimer.html'));
});

app.get('/status', (req, res) => {
    const status = {
        status: 'online',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        servers: config.minecraft.servers.map(server => ({
            name: server.name,
            ip: server.ip
        }))
    };
    res.json(status);
});

// Start Express server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    log.info(`Express server is running on port ${PORT}`);
});

// Start the bot

client.login(process.env.DISCORD_TOKEN);
