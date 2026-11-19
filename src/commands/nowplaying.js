const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');
const { createNowPlayingEmbed } = require('../music/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show what\'s currently playing'),

  aliases: ['np', 'nowplaying', 'current'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue || !queue.currentTrack) {
      return interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
    }

    const embed = createNowPlayingEmbed(queue.currentTrack, queue);
    // No buttons — 100% command-driven bot
    return interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  },

  async executeMessage(message) {
    const queue = musicManager.get(message.guild.id);
    if (!queue || !queue.currentTrack) {
      return message.reply('❌ No music is currently playing!');
    }

    const embed = createNowPlayingEmbed(queue.currentTrack, queue);
    return message.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
