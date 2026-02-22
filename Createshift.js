const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const fs = require('fs');
const path = require('path');

const SHIFT_CHANNEL_ID = '1459462632405995602';
const ALLOWED_ROLE_ID = '1459863461986304071';
const SHIFT_DATA_FILE = path.join(__dirname, '../data/shifts.json');

const LOCATIONS = {
    DPI: {
        name: 'De Pride Isle Sanatorium',
        short: 'DPI',
        link: 'https://www.roblox.com/games/128048309238244/De-Pride-Isle-Sanatorium'
    },
    LBE: {
        name: 'Les Beyond East',
        short: 'LBE',
        link: 'https://www.roblox.com/games/134056984965568/Les-Beyond-East'
    },
    GPCA: {
        name: 'Gaymoria Peak Church Asylum',
        short: 'GPCA',
        link: 'https://www.roblox.com/games/97277725160308/Gaymoria-Peak-Church-Asylum'
    }
};

const SHIFT_DURATIONS = {
    'Star':           45,
    'Star x2':        75,
    'Promotional x1': 75,
    'Promotional x2': 90
};

function loadShiftData() {
    if (!fs.existsSync(SHIFT_DATA_FILE)) {
        const dir = path.dirname(SHIFT_DATA_FILE);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(SHIFT_DATA_FILE, JSON.stringify({ messageId: null, shifts: [] }, null, 2));
    }
    return JSON.parse(fs.readFileSync(SHIFT_DATA_FILE, 'utf8'));
}

function saveShiftData(data) {
    fs.writeFileSync(SHIFT_DATA_FILE, JSON.stringify(data, null, 2));
}

function getRelativeTime(timestamp) {
    const now = Date.now();
    const diff = timestamp - now;
    if (diff <= 0) return 'teraz';
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    if (days > 0) return `in ${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `in ${hours} hour${hours > 1 ? 's' : ''}`;
    return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
}

function formatDate(timestamp) {
    const date = new Date(timestamp);
    const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const months = ['January', 'February', 'March', 'April', 'May', 'June',
        'July', 'August', 'September', 'October', 'November', 'December'];
    const dayName = days[date.getDay()];
    const day = date.getDate();
    const month = months[date.getMonth()];
    const year = date.getFullYear();
    const hours = String(date.getHours()).padStart(2, '0');
    const mins = String(date.getMinutes()).padStart(2, '0');
    return `${dayName}, ${day} ${month} ${year} ${hours}:${mins}`;
}

function buildEmbed(shifts) {
    const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle('✈️ Flight Schedule')
        .setDescription('**LeMonde Airlines Flights**\nConnecting the World since 2014.');

    if (shifts.length === 0) {
        embed.setFooter({ text: 'No upcoming flights scheduled.' });
        return embed;
    }

    const sorted = [...shifts].sort((a, b) => a.timestamp - b.timestamp);

    for (const shift of sorted) {
        const loc = LOCATIONS[shift.location];
        const relative = getRelativeTime(shift.timestamp);
        const formatted = formatDate(shift.timestamp);
        const duration = SHIFT_DURATIONS[shift.type];

        embed.addFields({
            name: `🚫 LMD ${shift.flightNumber} (${shift.createdBy})`,
            value: [
                ` [${loc.name}](${loc.link})`,
                ` ${shift.type} — ⏱️ ${duration} min`,
                ` ${formatted} (${relative})`
            ].join('\n'),
            inline: false
        });
    }

    embed.setFooter({ text: `Total flights: ${shifts.length}` }).setTimestamp();
    return embed;
}

async function updateFlightSchedule(client, shifts) {
    const channel = await client.channels.fetch(SHIFT_CHANNEL_ID).catch(() => null);
    if (!channel) return;

    const data = loadShiftData();
    const embed = buildEmbed(shifts);

    if (data.messageId) {
        try {
            const msg = await channel.messages.fetch(data.messageId);
            await msg.edit({ embeds: [embed] });
            return;
        } catch {
            // Message deleted, create new
        }
    }

    const msg = await channel.send({ embeds: [embed] });
    data.messageId = msg.id;
    data.shifts = shifts;
    saveShiftData(data);
}

// Schedule auto-removal for a single shift when it ends
function scheduleShiftRemoval(client, shift) {
    const duration = SHIFT_DURATIONS[shift.type] || 45;
    // End time = when shift starts + duration
    const endTime = shift.timestamp + duration * 60 * 1000;
    const delay = endTime - Date.now();

    if (delay <= 0) return; // already over

    setTimeout(async () => {
        const data = loadShiftData();
        const before = data.shifts.length;
        data.shifts = data.shifts.filter(s => s.id !== shift.id);
        if (data.shifts.length !== before) {
            saveShiftData(data);
            await updateFlightSchedule(client, data.shifts);
            console.log(`[SHIFT] ✅ Auto-removed LMD ${shift.flightNumber} (${shift.type}, ${duration} min ended)`);
        }
    }, delay);

    console.log(`[SHIFT] ⏳ LMD ${shift.flightNumber} ends in ${Math.round(delay / 60000)} min`);
}

// Called on bot startup — clean expired shifts and set timers for active ones
function initShiftTimers(client) {
    const data = loadShiftData();
    const now = Date.now();

    const activeBefore = data.shifts.length;
    data.shifts = data.shifts.filter(shift => {
        const duration = SHIFT_DURATIONS[shift.type] || 45;
        return (shift.timestamp + duration * 60 * 1000) > now;
    });

    if (data.shifts.length !== activeBefore) {
        saveShiftData(data);
        console.log(`[SHIFT] Cleaned ${activeBefore - data.shifts.length} expired shift(s) on startup`);
    }

    for (const shift of data.shifts) {
        scheduleShiftRemoval(client, shift);
    }

    console.log(`[SHIFT] Initialized ${data.shifts.length} active shift timer(s)`);
}

module.exports = {
    data: new SlashCommandBuilder()
        .setName('createshift')
        .setDescription('Create new shift')
        .addStringOption(opt =>
            opt.setName('location')
                .setDescription('location shift')
                .setRequired(true)
                .addChoices(
                    { name: 'DPI - De Pride Isle Sanatorium', value: 'DPI' },
                    { name: 'LBE - Les Beyond East', value: 'LBE' },
                    { name: 'GPCA - Gaymoria Peak Church Asylum', value: 'GPCA' }
                ))
        .addStringOption(opt =>
            opt.setName('type')
                .setDescription('Type shift')
                .setRequired(true)
                .addChoices(
                    { name: 'Star', value: 'Star' },
                    { name: 'Star x2', value: 'Star x2' },
                    { name: 'Promotional x1', value: 'Promotional x1' },
                    { name: 'Promotional x2', value: 'Promotional x2' }
                ))
        .addStringOption(opt =>
            opt.setName('date')
                .setDescription('Data (format: YYYY-MM-DD HH:MM np. 2026-02-22 19:00)')
                .setRequired(true)),

    async execute(interaction) {
        if (!interaction.member.roles.cache.has(ALLOWED_ROLE_ID)) {
            return interaction.reply({
                content: '❌ERROR',
                ephemeral: true
            });
        }

        const location = interaction.options.getString('location');
        const type = interaction.options.getString('type');
        const dateStr = interaction.options.getString('date');

        const timestamp = Date.parse(dateStr.replace(' ', 'T') + ':00');
        if (isNaN(timestamp)) {
            return interaction.reply({
                content: '❌ ERROR Use: `2026-02-22 19:00`',
                ephemeral: true
            });
        }

        if (timestamp < Date.now()) {
            return interaction.reply({
                content: '❌ ERROR',
                ephemeral: true
            });
        }

        const data = loadShiftData();
        const flightNumber = String(Math.floor(Math.random() * 900) + 100);

        const newShift = {
            id: Date.now().toString(),
            flightNumber,
            location,
            type,
            timestamp,
            createdBy: interaction.user.username,
            createdAt: Date.now()
        };

        data.shifts.push(newShift);
        saveShiftData(data);

        await updateFlightSchedule(interaction.client, data.shifts);
        scheduleShiftRemoval(interaction.client, newShift);

        const loc = LOCATIONS[location];
        const duration = SHIFT_DURATIONS[type];
        await interaction.reply({
            content: [
                ` Shift **LMD ${flightNumber}** added`,
                ` ${loc.name}`,
                ` ${type} — ⏱️ ${duration} min`,
                ` ${formatDate(timestamp)} (${getRelativeTime(timestamp)})`,
                ` Shift deleting auto after **${duration} minutes**`
            ].join('\n'),
            ephemeral: true
        });
    },

    updateFlightSchedule,
    loadShiftData,
    initShiftTimers
};
