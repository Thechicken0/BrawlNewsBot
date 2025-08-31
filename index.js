const { Client, GatewayIntentBits } = require('discord.js');
const axios = require('axios');
require('dotenv').config();

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ]
});

client.once('ready', () => {
  console.log(`Connecté en tant que ${client.user.tag}`);
});

// Exemple : Commande !ping
client.on('messageCreate', (msg) => {
  if (msg.content === '!ping') {
    msg.channel.send('Pong!');
  }
});

client.login(process.env.TOKEN);
