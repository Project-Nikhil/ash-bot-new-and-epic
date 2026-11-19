const { Events } = require('discord.js');
const musicManager = require('../music/MusicManager');
const guildSettings = require('../music/GuildSettings');

module.exports = {
  name: Events.VoiceStateUpdate,
  async execute(oldState, newState, client) {
    const guildId = newState.guild.id || oldState.guild.id;
    const queue = musicManager.get(guildId);
    if (!queue || queue.destroyed) return;

    const botId = client.user.id;

    // 1. If bot was moved to a different voice channel
    if (newState.id === botId && newState.channelId && newState.channelId !== queue.voiceChannel?.id) {
      if (guildSettings.get(guildId).stay247) return;
      queue.voiceChannel = newState.channel;
      guildSettings.set(guildId, { voiceChannelId: newState.channelId });
      queue.checkAloneStatus();
      return;
    }

    // 2. If bot was disconnected from voice channel
    if (oldState.id === botId && !newState.channelId) {
      if (!guildSettings.get(guildId).stay247) queue.destroy();
      return;
    }

    // 3. Check if human users joined or left the bot's voice channel (Alone check)
    const botChannelId = queue.voiceChannel?.id;
    if (botChannelId) {
      const involvesBotChannel = oldState.channelId === botChannelId || newState.channelId === botChannelId;
      if (involvesBotChannel) {
        queue.checkAloneStatus();
      }
    }
  }
};
