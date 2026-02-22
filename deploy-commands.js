/**
 * Minecraft Server Status Bot - Command Deployment
 * Created by Team BLK
 */
require('dotenv').config();
const { REST, Routes } = require('discord.js');
const config = require('./config.json');

const commands = [
    {
        name: 'status',
        description: 'Get the current status of a Minecraft server',
        options: [
            {
                name: 'server',
                description: 'The name of the server to check',
                type: 3,
                required: true,
                choices: config.minecraft.servers.map(server => ({
                    name: server.name,
                    value: server.name
                }))
            }
        ]
    },
    {
        name: 'createshift',
        description: 'Create shift w shudule',
        options: [
            {
                name: 'location',
                description: 'Location',
                type: 3,
                required: true,
                choices: [
                    { name: 'DPI - De Pride Isle Sanatorium', value: 'DPI' },
                    { name: 'LBE - Les Beyond East', value: 'LBE' },
                    { name: 'GPCA - Gaymoria Peak Church Asylum', value: 'GPCA' }
                ]
            },
            {
                name: 'type',
                description: 'Type shift',
                type: 3,
                required: true,
                choices: [
                    { name: 'Star', value: 'Star' },
                    { name: 'Star x2', value: 'Star x2' },
                    { name: 'Promotional x1', value: 'Promotional x1' },
                    { name: 'Promotional x2', value: 'Promotional x2' }
                ]
            },
            {
                name: 'date',
                description: 'Date shiftu (format: YYYY-MM-DD HH:MM ex. 2026-02-22 19:00)',
                type: 3,
                required: true
            }
        ]
    }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');
        await rest.put(
            Routes.applicationCommands(config.bot.clientId),
            { body: commands }
        );
        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})();


