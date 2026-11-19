require('dotenv').config();

const config = {
  token: process.env.DISCORD_TOKEN || '',
  clientId: process.env.CLIENT_ID || '',
  guildId: process.env.GUILD_ID || '',
  voiceChannelId: process.env.VOICE_CHANNEL_ID || '',
  prefix: process.env.PREFIX || '!',
  spotifyClientId: process.env.SPOTIFY_CLIENT_ID || '',
  spotifyClientSecret: process.env.SPOTIFY_CLIENT_SECRET || '',
  tenorApiKey: process.env.TENOR_API_KEY || '',
  databaseUrl: process.env.DATABASE_URL || '',
  youtubeCookies: process.env.YOUTUBE_COOKIES || '',
  youtubeCookiesPath: process.env.YOUTUBE_COOKIES_PATH || '',
  youtubeProxy: process.env.YOUTUBE_PROXY || process.env.HTTP_PROXY || process.env.HTTPS_PROXY || '',
  defaultVolume: 80,
  idleTimeoutMs: 180000,         // 3 minutes before leaving voice channel when not in 24/7 mode
  aloneTimeoutMs: 300000,        // 5 minutes alone in voice channel before pausing/leaving
  maxQueueSize: 100,             // Max tracks in queue
  maxPlaylistImport: 100,        // Max tracks imported from a single playlist
  maxTrackDurationSeconds: 10800 // 3 hours max per track (livestreams exempt)
};

/**
 * Redacts bot token and secrets from log strings
 * @param {string} text
 * @returns {string}
 */
function redactSecrets(text) {
  if (typeof text !== 'string') return text;
  let clean = text;
  if (config.token) {
    clean = clean.split(config.token).join('[REDACTED_DISCORD_TOKEN]');
  }
  if (config.spotifyClientSecret) {
    clean = clean.split(config.spotifyClientSecret).join('[REDACTED_SPOTIFY_SECRET]');
  }
  return clean;
}

module.exports = {
  ...config,
  redactSecrets
};
