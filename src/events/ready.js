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
      activities: [{
        name: '/play | 24/7 Music',
        type: ActivityType.Listening
      }],
      status: 'online'
    });

    // 1. Auto-Rejoin 24/7 Voice Channels & Restore Queues on Startup
    for (const [guildId, settings] of Object.entries(guildSettings.cache)) {
      if (settings.stay247 && settings.voiceChannelId) {
        try {
          const voiceChannel = await client.channels.fetch(settings.voiceChannelId).catch(() => null);
          const textChannel = settings.textChannelId
            ? await client.channels.fetch(settings.textChannelId).catch(() => null)
            : null;

          if (voiceChannel) {
            console.log(`[Startup 24/7] Rejoining voice channel "${voiceChannel.name}" in guild "${voiceChannel.guild.name}"...`);
            const queue = musicManager.getOrCreate({
              guildId,
              voiceChannel,
              textChannel
            });

            // Restore saved queue tracks if any were saved before shutdown
            if (Array.isArray(settings.savedQueue) && settings.savedQueue.length > 0) {
              const restoredTracks = settings.savedQueue.map(item => new Track(item));
              console.log(`[Startup 24/7] Restoring ${restoredTracks.length} saved track(s) for guild ${guildId}...`);
              queue.enqueue(restoredTracks);
            }
          } else {
            console.warn(`[Startup 24/7] Saved voice channel ${settings.voiceChannelId} not found in guild ${guildId}. Disabling 24/7.`);
            guildSettings.set(guildId, { stay247: false, voiceChannelId: null });
            if (textChannel) {
              textChannel.send('⚠️ The saved 24/7 voice channel was deleted or is no longer accessible. 24/7 mode has been disabled.').catch(() => {});
            }
          }
        } catch (err) {
          console.error(`[Startup 24/7] Failed to reconnect guild ${guildId}:`, err.message);
        }
      }

      // Reset any pinned music dashboards to standby
      await musicManager.refreshDashboard(client, guildId, null);
    }
  }
};
