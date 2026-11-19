const fs = require('fs');
const path = require('path');
const { Client, Collection, GatewayIntentBits } = require('discord.js');
const config = require('./config');

if (!config.token) {
  console.error('❌ Error: DISCORD_TOKEN is missing!');
  console.error('👉 Please copy .env.example to .env and fill in your Bot Token and Client ID.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// Load Commands & Aliases
client.commands = new Collection();
client.aliases = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  if ('data' in command) {
    client.commands.set(command.data.name, command);

    // Register text command aliases
    if (command.aliases && Array.isArray(command.aliases)) {
      for (const alias of command.aliases) {
        client.aliases.set(alias.toLowerCase(), command);
      }
    }
  } else {
    console.warn(`[WARN] The command at ${filePath} is missing a required "data" property.`);
  }
}

// Load Events
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// Global process error handlers
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', error);
});

// Built-in HTTP Healthcheck & Keep-Alive Server (For 24/7 Hosting on Render / Railway / UptimeRobot)
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({
    status: 'online',
    bot: client.user?.tag || 'Initializing...',
    uptime: Math.floor(process.uptime()),
    timestamp: new Date().toISOString()
  }));
}).listen(PORT, () => {
  console.log(`🌐 [24/7 Server] HTTP keep-alive server listening on port ${PORT}`);
});

client.login(config.token).catch((err) => {
  console.error('❌ Failed to login to Discord:', err.message);
  process.exit(1);
});
