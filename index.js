require('dotenv').config();
const fs = require('fs');
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const Parser = require('rss-parser');
const parser = new Parser();

const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages] });

const CONFIG_FILE = './config.json';
let guildConfig = {};
if (fs.existsSync(CONFIG_FILE)) guildConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));

const LAST_POST_FILE = './lastPosted.json';
let lastPosted = {};
if (fs.existsSync(LAST_POST_FILE)) lastPosted = JSON.parse(fs.readFileSync(LAST_POST_FILE, 'utf-8'));

// Feeds Brawl Stars officiels
const FEEDS = [
    { name: 'Brawl Talks', url: 'https://www.youtube.com/feeds/videos.xml?channel_id=UCooVYzDxdwTtGYAkcPmOgOw' },
    // Ajoute ici d’autres feeds officiels pour patch notes, événements, récompenses gratuites
];

// Sauvegarde config et lastPosted
function saveConfig() { fs.writeFileSync(CONFIG_FILE, JSON.stringify(guildConfig, null, 4)); }
function saveLastPosted() { fs.writeFileSync(LAST_POST_FILE, JSON.stringify(lastPosted, null, 4)); }

// Résumé patch notes / fallback description
function getPatchSummary(content) {
    if (!content || content.trim() === '') return 'Pas de description disponible.';
    const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
    const bullets = lines.filter(line => line.startsWith('-') || line.match(/buff|nerf|new|skin|gadget|change|reward|event/i));
    if (bullets.length > 0) return bullets.slice(0, 10).join("\n");
    return content.length > 300 ? content.slice(0, 300) + "…" : content;
}

// Vérifie tous les feeds et poste les nouvelles news
async function checkAllNews() {
    for (const feed of FEEDS) {
        try {
            const parsed = await parser.parseURL(feed.url);
            if (!parsed.items) continue;

            for (const item of parsed.items) {
                const key = `${feed.name}-${item.guid}`;
                if (lastPosted[key]) continue;

                const embed = new EmbedBuilder()
                    .setTitle(`${feed.name}: ${item.title}`)
                    .setURL(item.link)
                    .setDescription(getPatchSummary(item.content || item.contentSnippet))
                    .setTimestamp(new Date(item.pubDate || Date.now()))
                    .setColor(0xff0000)
                    .setFooter({ text: 'BrawlStars News' });

                client.guilds.cache.forEach(guild => {
                    const config = guildConfig[guild.id];
                    if (!config || !config.newsChannelId) return;

                    const channel = guild.channels.cache.get(config.newsChannelId);
                    if (channel && channel.isTextBased()) channel.send({ embeds: [embed] }).catch(console.error);
                });

                lastPosted[key] = true;
            }
        } catch (err) {
            console.error(`Erreur récupération feed ${feed.name}:`, err);
        }
    }
    saveLastPosted();
}

// Slash commands
const commands = [
    new SlashCommandBuilder()
        .setName('admin-newschannel')
        .setDescription('Définir le salon où le bot poste les news')
        .addChannelOption(option => option.setName('channel').setDescription('Salon pour les news').setRequired(true)),
    new SlashCommandBuilder()
        .setName('latest-news')
        .setDescription('Afficher les dernières news')
].map(cmd => cmd.toJSON());

// Déploiement guild-specific
async function deployCommands(guildId) {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationGuildCommands(client.user.id, guildId), { body: commands });
        console.log(`Slash commands deployées sur le serveur ${guildId}`);
    } catch (err) { console.error(err); }
}

client.once('ready', () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
    client.guilds.cache.forEach(guild => deployCommands(guild.id));
    checkAllNews();
    setInterval(checkAllNews, 10 * 60 * 1000); // toutes les 10 minutes
});

// Auto deploy pour nouveau serveur
client.on('guildCreate', guild => { deployCommands(guild.id); });

// Interaction
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    const adminCheck = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator);
    if (!adminCheck) return interaction.reply({ content: 'Seuls les admins peuvent utiliser cette commande.', ephemeral: true });

    const { commandName } = interaction;

    if (commandName === 'admin-newschannel') {
        const channel = interaction.options.getChannel('channel');
        if (!channel.isTextBased()) return interaction.reply({ content: 'Choisissez un salon texte valide.', ephemeral: true });

        guildConfig[interaction.guildId] = guildConfig[interaction.guildId] || {};
        guildConfig[interaction.guildId].newsChannelId = channel.id;
        saveConfig();

        interaction.reply({ content: `Salon des news défini sur <#${channel.id}>`, ephemeral: false });

    } else if (commandName === 'latest-news') {
        try {
            const embedList = [];
            for (const feed of FEEDS) {
                const parsed = await parser.parseURL(feed.url);
                if (!parsed.items) continue;
                parsed.items.slice(0, 5).forEach(item => {
                    embedList.push(new EmbedBuilder()
                        .setTitle(`${feed.name}: ${item.title}`)
                        .setURL(item.link)
                        .setDescription(getPatchSummary(item.content || item.contentSnippet))
                        .setTimestamp(new Date(item.pubDate || Date.now()))
                        .setColor(0xff0000)
                        .setFooter({ text: 'BrawlStars News' }));
                });
            }

            if (embedList.length === 0) return interaction.reply({ content: 'Pas de news récentes trouvées.', ephemeral: true });
            interaction.reply({ embeds: embedList.slice(0, 5) }); // top 5

        } catch (err) {
            console.error(err);
            interaction.reply({ content: 'Erreur lors de la récupération des news.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
