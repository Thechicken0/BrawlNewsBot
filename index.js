const { Client, GatewayIntentBits, Partials, REST, Routes, SlashCommandBuilder, PermissionsBitField, EmbedBuilder } = require('discord.js');
const fetch = require('node-fetch');

// Remplace par ton token et ton client ID
const TOKEN = process.env.TOKEN;
const CLIENT_ID = "1411692797978738849";

let newsChannelId = null; // ID du salon où poster les news

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
  partials: [Partials.Channel]
});

// --------- COMMANDES SLASH ---------
const commands = [
  new SlashCommandBuilder()
    .setName('admin-newschannel')
    .setDescription('Définit le salon où seront publiées les news.')
    .addChannelOption(option =>
      option.setName('salon')
        .setDescription('Salon pour les news')
        .setRequired(true)
    ),

  new SlashCommandBuilder()
    .setName('latest-news')
    .setDescription('Affiche les dernières news Brawl Stars.')
].map(command => command.toJSON());

// --------- REGISTRATION DES COMMANDES ---------
const rest = new REST({ version: '10' }).setToken(TOKEN);

(async () => {
  try {
    console.log("Enregistrement des commandes...");
    await rest.put(
      Routes.applicationCommands(CLIENT_ID),
      { body: commands },
    );
    console.log("Commandes enregistrées !");
  } catch (error) {
    console.error(error);
  }
})();

// --------- FETCH DES NEWS ---------
async function fetchYouTubeNews() {
  try {
    const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=UCooVYzDxdwTtGYAkcPmOgOw`);
    const data = await res.text();
    const regex = /<entry>.*?<title>(.*?)<\/title>.*?<link rel="alternate" href="(.*?)".*?<published>(.*?)<\/published>/gs;
    let results = [];
    let match;
    while ((match = regex.exec(data)) !== null) {
      results.push({
        title: match[1],
        url: match[2],
        date: new Date(match[3])
      });
    }
    return results.slice(0, 5);
  } catch {
    return [];
  }
}

async function fetchBlogNews() {
  try {
    const res = await fetch("https://blog.brawlstars.com/index.xml");
    const data = await res.text();
    const regex = /<item>.*?<title>(.*?)<\/title>.*?<link>(.*?)<\/link>.*?<pubDate>(.*?)<\/pubDate>/gs;
    let results = [];
    let match;
    while ((match = regex.exec(data)) !== null) {
      results.push({
        title: match[1],
        url: match[2],
        date: new Date(match[3])
      });
    }
    return results.slice(0, 5);
  } catch {
    return [];
  }
}

async function fetchBrawlifyNews() {
  try {
    const res = await fetch("https://api.brawlapi.com/v1/blog");
    const json = await res.json();
    return json.slice(0, 5).map(item => ({
      title: item.title,
      url: item.link,
      date: new Date(item.date)
    }));
  } catch {
    return [];
  }
}

async function getAllNews() {
  const [yt, blog, brawlify] = await Promise.all([
    fetchYouTubeNews(),
    fetchBlogNews(),
    fetchBrawlifyNews()
  ]);
  const all = [...yt, ...blog, ...brawlify];
  return all.sort((a, b) => b.date - a.date);
}

// --------- ENVOI DES NEWS ---------
async function sendNews(channel) {
  const news = await getAllNews();
  if (news.length === 0) {
    return channel.send("Aucune news trouvée pour le moment !");
  }

  const embeds = news.slice(0, 5).map(item => new EmbedBuilder()
    .setTitle(item.title)
    .setURL(item.url)
    .setDescription(`Publié le ${item.date.toLocaleDateString()}`)
    .setColor(0xFFD700)
  );

  for (const embed of embeds) {
    await channel.send({ embeds: [embed] });
  }
}

// --------- BOT READY ---------
client.once('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

// --------- GESTION DES COMMANDES ---------
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = interaction.commandName;

  if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
    return interaction.reply({ content: "Seuls les admins peuvent utiliser cette commande.", ephemeral: true });
  }

  if (command === 'admin-newschannel') {
    const channel = interaction.options.getChannel('salon');
    newsChannelId = channel.id;
    await interaction.reply(`Le salon des news est maintenant <#${newsChannelId}>`);
  }

  if (command === 'latest-news') {
    await interaction.deferReply();
    if (!newsChannelId) {
      await interaction.editReply("Aucun salon de news défini !");
      return;
    }
    const channel = await client.channels.fetch(newsChannelId);
    await sendNews(channel);
    await interaction.editReply("News envoyées !");
  }
});

client.login(TOKEN);
