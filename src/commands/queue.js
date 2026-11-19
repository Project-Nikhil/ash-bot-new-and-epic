const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');
const { createQueueEmbed } = require('../music/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('queue')
    .setDescription('View the current song and upcoming queue'),

  aliases: ['q', 'queue'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue || (!queue.currentTrack && queue.tracks.length === 0)) {
      return interaction.reply({ content: '📜 The queue is completely empty right now!', ephemeral: true });
    }

    const embed = createQueueEmbed(queue);
    return interaction.reply({ embeds: [embed] });
  },

  async executeMessage(message) {
    const queue = musicManager.get(message.guild.id);
    if (!queue || (!queue.currentTrack && queue.tracks.length === 0)) {
      return message.reply('📜 The queue is completely empty right now!');
    }

    const embed = createQueueEmbed(queue);
    return message.reply({ embeds: [embed] });
  }
};
