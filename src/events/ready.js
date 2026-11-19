const { Events, ActivityType } = require('discord.js');
const guildSettings = require('../music/GuildSettings');
const VoicePresence = require('../music/VoicePresence');
const config = require('../config');

module.exports = {
  name: Events.ClientReady,
  once: true,
  async execute(client) {
    console.log(`[READY] Logged in as ${client.user.username} (ID: ${client.user.id})`);

    client.user.setPresence({
      activities: [{ name: '/play | 24/7 Music', type: ActivityType.Listening }],
      status: 'online'
    });

    await guildSettings.loaded;
    if (config.guildId && config.voiceChannelId && !guildSettings.cache[config.guildId]) {
      guildSettings.set(config.guildId, { stay247: true, voiceChannelId: config.voiceChannelId });
    }
    new VoicePresence(client).start();
  }
};
