const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('pause')
    .setDescription('Pause the current playing music'),

  aliases: ['pause'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue || !queue.currentTrack) {
      return interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
    }

    if (queue.isPaused) {
      return interaction.reply({ content: '⏸️ Playback is already paused! Use `/resume` to continue.', ephemeral: true });
    }

    queue.pause();
    return interaction.reply('⏸️ **Paused** playback. Use `/resume` to continue.');
  },

  async executeMessage(message) {
    const queue = musicManager.get(message.guild.id);
    if (!queue || !queue.currentTrack) {
      return message.reply('❌ No music is currently playing!');
    }

    if (queue.isPaused) {
      return message.reply('⏸️ Playback is already paused! Use `!resume` to continue.');
    }

    queue.pause();
    return message.reply('⏸️ **Paused** playback.');
  }
};
