const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('skip')
    .setDescription('Skip the currently playing track'),

  aliases: ['s', 'skip', 'next'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue || !queue.currentTrack) {
      return interaction.reply({ content: '❌ No music is currently playing to skip!', ephemeral: true });
    }

    const title = queue.currentTrack.title;
    queue.skip();
    return interaction.reply(`⏭️ Skipped **${title}**.`);
  },

  async executeMessage(message) {
    const queue = musicManager.get(message.guild.id);
    if (!queue || !queue.currentTrack) {
      return message.reply('❌ No music is currently playing to skip!');
    }

    const title = queue.currentTrack.title;
    queue.skip();
    return message.reply(`⏭️ Skipped **${title}**.`);
  }
};
