require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Parser = require('rss-parser');
const parser = new Parser();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// ID de la chaîne YouTube officielle Brawl Stars
const YT_CHANNEL_ID = "UC0O1Y0oZzESlV8bW2dh7nUw";
const FEED_URL = `https://www.youtube.com/feeds/videos.xml?channel_id=${YT_CHANNEL_ID}`;

// Stocke la dernière vidéo postée
let lastPosted = null;

// Fonction pour extraire un résumé des patch notes depuis la description YouTube
function getPatchSummary(content) {
    if (!content) return '';
    const lines = content.split("\n").map(l => l.trim()).filter(Boolean);
    const bullets = lines.filter(line => line.startsWith('-') || line.match(/buff|nerf|new|skin|gadget|change/i));
    if (bullets.length > 0) return bullets.slice(0, 10).join("\n");
    return content.length > 300 ? content.slice(0, 300) + "…" : content;
}

// Fonction principale pour récupérer et poster les Brawl Talks
async function checkBrawlTalks() {
    try {
        const feed = await parser.parseURL(FEED_URL);
        if (!feed.items || feed.items.length === 0) return;

        const latest = feed.items[0];
        if (latest.guid === lastPosted) return; // Déjà posté
        lastPosted = latest.guid;

        const description = getPatchSummary(latest.content || latest.contentSnippet);

        const embed = new EmbedBuilder()
            .setTitle(latest.title)
            .setURL(latest.link)
            .setDescription(description)
            .setTimestamp(new Date(latest.pubDate || Date.now()))
            .setColor(0xff0000)
            .setFooter({ text: 'BrawlStars News' });

        if (latest.thumbnail) embed.setThumbnail(latest.thumbnail);

        // Envoie dans tous les serveurs où le bot est présent
        client.guilds.cache.forEach(guild => {
            const channel = guild.channels.cache.find(c => c.name === "brawlstars-news");
            if (channel && channel.isTextBased()) {
                channel.send({ embeds: [embed] }).catch(console.error);
            }
        });

        console.log(`Vidéo postée: ${latest.title}`);

    } catch (err) {
        console.error("Erreur récupération Brawl Talks:", err);
    }
}

// Quand le bot est prêt
client.once('ready', () => {
    console.log(`Connecté en tant que ${client.user.tag}`);
    // Vérifie toutes les 10 minutes
    checkBrawlTalks();
    setInterval(checkBrawlTalks, 10 * 60 * 1000);
});

// Connexion au bot Discord
client.login(process.env.TOKEN);
