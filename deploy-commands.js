/**
 * Minecraft Server Status Bot - Command Deployment
 * Created by Team BLK
 */

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
                type: 3, // STRING
                required: true,
                choices: config.minecraft.servers.map(server => ({
                    name: server.name,
                    value: server.name
                }))
            }
        ],
    }
];

const rest = new REST({ version: '10' }).setToken(config.bot.token);

(async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(config.bot.clientId),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error(error);
    }
})(); 
