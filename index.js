const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1411692797978738849";

let newsChannelId = null;

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

// -------- COMMANDES SLASH --------
const commands = [
  new SlashCommandBuilder()
    .setName('admin-newschannel')
    .setDescription('Définit le salon pour les news.')
    .addChannelOption(option => option.setName('salon').setDescription('Salon pour les news').setRequired(true)),

  new SlashCommandBuilder()
    .setName('latest-news')
    .setDescription('Affiche les dernières news Brawl Stars.')
].map(cmd => cmd.toJSON());

// -------- ENREGISTREMENT DES COMMANDES --------
const rest = new REST({ version: '10' }).setToken(TOKEN);
(async () => {
  try {
    console.log("Enregistrement des commandes...");
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
    console.log("Commandes enregistrées !");
  } catch (err) {
    console.error(err);
  }
})();

// -------- FETCH DES NEWS --------
async function fetchYouTubeNews() {
  try {
    const res = await fetch("https://www.youtube.com/feeds/videos.xml?channel_id=UCooVYzDxdwTtGYAkcPmOgOw");
    const data = await res.text();
    const regex = /<entry>.*?<title>(.*?)<\/title>.*?<link rel="alternate" href="(.*?)".*?<published>(.*?)<\/published>/gs;
    const results = [];
    let match;
    while ((match = regex.exec(data)) !== null) {
      results.push({ title: match[1], url: match[2], date: new Date(match[3]) });
    }
    return results;
  } catch { return []; }
}

async function fetchBlogNews() {
  try {
    const res = await fetch("https://blog.brawlstars.com/index.xml");
    const data = await res.text();
    const regex = /<item>.*?<title>(.*?)<\/title>.*?<link>(.*?)<\/link>.*?<pubDate>(.*?)<\/pubDate>/gs;
    const results = [];
    let match;
    while ((match = regex.exec(data)) !== null) {
      results.push({ title: match[1], url: match[2], date: new Date(match[3]) });
    }
    return results;
  } catch { return []; }
}

async function fetchBrawlifyNews() {
  try {
    const res = await fetch("https://api.brawlapi.com/v1/blog");
    const json = await res.json();
    return json.map(item => ({ title: item.title, url: item.link, date: new Date(item.date) }));
  } catch { return []; }
}

async function getAllNews(limit = 5) {
  const [yt, blog, brawlify] = await Promise.all([fetchYouTubeNews(), fetchBlogNews(), fetchBrawlifyNews()]);
  const all = [...yt, ...blog, ...brawlify];
  const seen = new Set();
  const unique = [];
  all.sort((a,b) => b.date - a.date).forEach(n => {
    if (!seen.has(n.url)) {
      seen.add(n.url);
      unique.push(n);
    }
  });
  return unique.slice(0, limit);
}

// -------- ENVOI DES NEWS --------
async function sendNews(channel) {
  const news = await getAllNews(5);
  if (!news.length) return channel.send("Aucune news trouvée pour le moment !");
  for (const item of news) {
    const embed = new EmbedBuilder()
      .setTitle(item.title)
      .setURL(item.url)
      .setDescription(`Publié le ${item.date.toLocaleDateString()}`)
      .setColor(0xFFD700);
    await channel.send({ embeds: [embed] });
  }
}

// -------- READY --------
client.once('ready', () => console.log(`Connecté en tant que ${client.user.tag}`));

// -------- INTERACTIONS --------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    const cmd = interaction.commandName;

    if (cmd === 'admin-newschannel') {
      if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
        return interaction.reply({ content: "Seuls les admins peuvent utiliser cette commande.", ephemeral: true });
      }
      const channel = interaction.options.getChannel('salon');
      newsChannelId = channel.id;
      return interaction.reply(`Le salon des news est maintenant <#${newsChannelId}>`);
    }

    if (cmd === 'latest-news') {
      await interaction.deferReply();
      if (!newsChannelId) return interaction.editReply("Aucun salon de news défini !");
      const channel = await client.channels.fetch(newsChannelId);
      await sendNews(channel);
      return interaction.editReply("News envoyées !");
    }

  } catch (err) {
    console.error("Erreur interaction:", err);
    if (interaction.deferred || interaction.replied) {
      interaction.editReply("Une erreur est survenue.");
    } else {
      interaction.reply({ content: "Une erreur est survenue.", ephemeral: true });
    }
  }
});

// -------- LOGIN --------
client.login(TOKEN);
