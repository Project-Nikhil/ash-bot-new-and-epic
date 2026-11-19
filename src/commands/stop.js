const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');
const guildSettings = require('../music/GuildSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('stop')
    .setDescription('Stop music playback, clear the queue, and leave voice (unless 24/7 is enabled)'),

  aliases: ['stop', 'leave', 'dc', 'disconnect'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue) {
      return interaction.reply({ content: '❌ No active music session in this server!', ephemeral: true });
    }

    const is247 = guildSettings.get(interaction.guildId).stay247;
    queue.stop();

    if (is247) {
      return interaction.reply('⏹️ Stopped playback and cleared the queue. *(24/7 mode is ON, so I will remain in the voice channel)*');
    }
    return interaction.reply('⏹️ Stopped playback, cleared the queue, and left the voice channel.');
  },

  async executeMessage(message) {
    const queue = musicManager.get(message.guild.id);
    if (!queue) {
      return message.reply('❌ No active music session in this server!');
    }

    const is247 = guildSettings.get(message.guild.id).stay247;
    queue.stop();

    if (is247) {
      return message.reply('⏹️ Stopped playback and cleared the queue. *(24/7 mode is ON, staying in VC)*');
    }
    return message.reply('⏹️ Stopped playback, cleared the queue, and left the voice channel.');
  }
};
