require('dotenv').config();

module.exports = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  guildId: process.env.GUILD_ID || '',
  prefix: process.env.PREFIX || 'ash.',
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  tenorApiKey: process.env.TENOR_API_KEY || '',
  defaultVolume: 80,
  idleTimeoutMs: 180000, // 3 minutes idle before leaving voice channel
  maxQueueSize: 15,
  maxPlaylistImport: 15,
};
