require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, PermissionsBitField, SlashCommandBuilder, Routes } = require('discord.js');
const { REST } = require('@discordjs/rest');
const Parser = require('rss-parser');
const parser = new Parser();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

// Config YouTube / Brawl Stars
const YT_CHANNEL_ID = "UC0O1Y0oZzESlV8bW2dh7nUw";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL_ID}`;

let lastPosted = null;

// Stockage simple par serveur
const guildConfig = {}; // { guildId: { newsChannelId, lastPostedGuid } }

// Fonction pour extraire un résumé des patch notes
function getPatchSummary(content) {
    if (!content) return '';
    const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
    const bullets = lines.filter(line => line.startsWith('-') || line.match(/buff|nerf|new|skin|gadget|change/i));
    if (bullets.length > 0) return bullets.slice(0, 10).join("\n");
    return content.length > 300 ? content.slice(0, 300) + "…" : content;
}

// Vérifie et poste les dernières vidéos
async function checkBrawlTalks() {
    try {
        const feed = await parser.parseURL(FEED_URL);
        if (!feed.items || feed.items.length === 0) return;

        const latest = feed.items[0];
        if (lastPosted && latest.guid === lastPosted) return;
        lastPosted = latest.guid;

        const description = getPatchSummary(latest.content || latest.contentSnippet);
        const embed = new EmbedBuilder()
            .setTitle(latest.title)
            .setURL(latest.link)
            .setDescription(description)
            .setTimestamp(new Date(latest.pubDate || Date.now()))
            .setColor(0xff0000)
            .setFooter({ text: 'BrawlStars News' });

        client.guilds.cache.forEach(guild => {
            const config = guildConfig[guild.id];
            if (!config || !config.newsChannelId) return;

            const channel = guild.channels.cache.get(config.newsChannelId);
            if (channel && channel.isTextBased()) {
                channel.send({ embeds: [embed] }).catch(console.error);
            }
        });

    } catch (err) {
        console.error("Erreur récupération Brawl Talks:", err);
    }
}

// Commandes slash
const commands = [
    new SlashCommandBuilder()
        .setName('admin-newschannel')
        .setDescription('Définir le salon où le bot poste les news')
        .addChannelOption(option =>
            option.setName('channel')
                .setDescription('Salon pour les news')
                .setRequired(true)),
    new SlashCommandBuilder()
        .setName('latest-news')
        .setDescription('Afficher les dernières news de la semaine')
].map(cmd => cmd.toJSON());

// Déploiement slash commands
client.once('ready', async () => {
    console.log(`Connecté en tant que ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('Slash commands deployées !');
    } catch (err) {
        console.error(err);
    }

    // Lancer le check des news toutes les 10 min
    checkBrawlTalks();
    setInterval(checkBrawlTalks, 10 * 60 * 1000);
});

// Interaction slash commands
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
        interaction.reply({ content: `Salon des news défini sur <#${channel.id}>`, ephemeral: false });

    } else if (commandName === 'latest-news') {
        try {
            const feed = await parser.parseURL(FEED_URL);
            if (!feed.items || feed.items.length === 0) return interaction.reply({ content: 'Pas de news disponibles.', ephemeral: true });

            const now = new Date();
            const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            let items = feed.items.filter(item => new Date(item.pubDate) > oneWeekAgo);
            if (items.length === 0) { // fallback semaine précédente
                const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
                items = feed.items.filter(item => new Date(item.pubDate) > twoWeeksAgo);
            }

            if (items.length === 0) return interaction.reply({ content: 'Pas de news récentes trouvées.', ephemeral: true });

            const latest = items[0];
            const description = getPatchSummary(latest.content || latest.contentSnippet);
            const embed = new EmbedBuilder()
                .setTitle(latest.title)
                .setURL(latest.link)
                .setDescription(description)
                .setTimestamp(new Date(latest.pubDate || Date.now()))
                .setColor(0xff0000)
                .setFooter({ text: 'BrawlStars News' });

            interaction.reply({ embeds: [embed] });

        } catch (err) {
            console.error(err);
            interaction.reply({ content: 'Erreur lors de la récupération des news.', ephemeral: true });
        }
    }
});

client.login(process.env.TOKEN);
