const { Events, ActivityType } = require('discord.js');
const guildSettings = require('../music/GuildSettings');
const musicManager = require('../music/MusicManager');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`[READY] Logged in as ${client.user.tag} (ID: ${client.user.id})`);

    client.user.setPresence({
      activities: [{
        name: '#🎵・ash-music',
        type: ActivityType.Listening
      }],
      status: 'online'
    });

    // Reset any pinned music dashboards back to clean standby state on startup
    for (const guildId of Object.keys(guildSettings.cache)) {
      await musicManager.refreshDashboard(client, guildId, null);
    }
  }
};
