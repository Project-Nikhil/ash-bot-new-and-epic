const fs = require('fs');
const path = require('path');
const http = require('http');
const { exec } = require('child_process');
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
  ],
  allowedMentions: {
    parse: [],
    repliedUser: false
  }
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

// Global Process Error Handlers with Secret Redaction
process.on('unhandledRejection', (reason) => {
  console.error('[Unhandled Rejection]', config.redactSecrets(String(reason?.stack || reason)));
});

process.on('uncaughtException', (error) => {
  console.error('[Uncaught Exception]', config.redactSecrets(String(error?.stack || error)));
});

// Built-in HTTP Healthcheck Server (Plain "ok" response - no leaks)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('ok');
}).listen(PORT, () => {
  console.log(`🌐 [24/7 Keep-Alive] Healthcheck server listening on port ${PORT}`);
});

// Gateway & Voice Watchdog
let disconnectedSince = null;
setInterval(() => {
  // Status: 0 = READY, 1 = CONNECTING, 2 = RECONNECTING, 3 = IDLE, 4 = NEARLY, 5 = DISCONNECTED
  if (client.ws.status !== 0) {
    if (!disconnectedSince) disconnectedSince = Date.now();
    const offlineSeconds = Math.floor((Date.now() - disconnectedSince) / 1000);

    if (offlineSeconds >= 120) {
      console.error(`🚨 [Watchdog] Gateway unresponsive for ${offlineSeconds}s. Restarting process...`);
      process.exit(1); // Exits so Docker / Render restarts the container
    }
  } else {
    disconnectedSince = null;
  }
}, 30000);

// Memory Watcher (Logs usage every 5 mins, warns if > 400MB)
setInterval(() => {
  const mem = process.memoryUsage();
  const rssMb = Math.round(mem.rss / 1024 / 1024);
  const heapMb = Math.round(mem.heapUsed / 1024 / 1024);

  if (rssMb > 400) {
    console.warn(`⚠️ [Memory Watcher] RSS memory is ${rssMb}MB (Heap: ${heapMb}MB). Approaching Render host threshold.`);
    if (global.gc) global.gc();
  }
}, 300000);

// yt-dlp Periodic Auto-Update (Every 12 hours)
function checkYtdlUpdate() {
  exec('yt-dlp -U', (err, stdout, stderr) => {
    if (err) {
      console.warn('[yt-dlp Update Check]', (stderr || err.message).trim().slice(0, 100));
    } else {
      console.log('[yt-dlp Update Check]', stdout.trim().slice(0, 100));
    }
  });
}
setTimeout(checkYtdlUpdate, 30000);
setInterval(checkYtdlUpdate, 12 * 60 * 60 * 1000);

// Graceful Shutdown Handler (SIGTERM on Render redeploy, SIGINT on Ctrl+C)
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`[Shutdown] Received ${signal}. Saving active queues and closing voice streams...`);

  const musicManager = require('./music/MusicManager');
  for (const queue of musicManager.queues.values()) {
    try {
      queue.saveState();
      queue.destroy();
    } catch (_) {}
  }

  try {
    client.destroy();
  } catch (_) {}

  console.log('[Shutdown] Clean shutdown completed. Exiting.');
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

client.login(config.token).catch((err) => {
  console.error('❌ Failed to login to Discord:', config.redactSecrets(err.message));
  process.exit(1);
});
