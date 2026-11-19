const { Events, ActivityType } = require('discord.js');
const guildSettings = require('../music/GuildSettings');
const musicManager = require('../music/MusicManager');
const { Track } = require('../music/Track');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`[READY] Logged in as ${client.user.username} (ID: ${client.user.id})`);

    client.user.setPresence({
      activities: [{ name: '/play | 24/7 Music', type: ActivityType.Listening }],
      status: 'online'
    });

    // Auto-rejoin 24/7 voice channels and restore saved queues on startup
    for (const [guildId, settings] of Object.entries(guildSettings.cache)) {
      if (settings.stay247 && settings.voiceChannelId) {
        try {
          const voiceChannel = await client.channels.fetch(settings.voiceChannelId).catch(() => null);
          const textChannel = settings.textChannelId
            ? await client.channels.fetch(settings.textChannelId).catch(() => null)
            : null;

          if (voiceChannel) {
            console.log(`[Startup 24/7] Rejoining "${voiceChannel.name}" in "${voiceChannel.guild.name}"...`);
            const queue = musicManager.getOrCreate({ guildId, voiceChannel, textChannel });

            if (Array.isArray(settings.savedQueue) && settings.savedQueue.length > 0) {
              const restoredTracks = settings.savedQueue.map(item => new Track(item));
              console.log(`[Startup 24/7] Restoring ${restoredTracks.length} track(s) for guild ${guildId}...`);
              queue.enqueue(restoredTracks);
            }
          } else {
            console.warn(`[Startup 24/7] Voice channel ${settings.voiceChannelId} not found — disabling 24/7 for guild ${guildId}.`);
            guildSettings.set(guildId, { stay247: false, voiceChannelId: null });
          }
        } catch (err) {
          console.error(`[Startup 24/7] Failed to reconnect guild ${guildId}:`, err.message);
        }
      }
    }
  }
};
