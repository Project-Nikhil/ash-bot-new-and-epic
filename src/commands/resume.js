const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('resume')
    .setDescription('Resume paused music playback'),

  aliases: ['resume', 'unpause'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue || !queue.currentTrack) {
      return interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
    }

    if (!queue.isPaused) {
      return interaction.reply({ content: '▶️ Music is already playing!', ephemeral: true });
    }

    queue.resume();
    return interaction.reply('▶️ **Resumed** playback.');
  },

  async executeMessage(message) {
    const queue = musicManager.get(message.guild.id);
    if (!queue || !queue.currentTrack) {
      return message.reply('❌ No music is currently playing!');
    }

    if (!queue.isPaused) {
      return message.reply('▶️ Music is already playing!');
    }

    queue.resume();
    return message.reply('▶️ **Resumed** playback.');
  }
};
