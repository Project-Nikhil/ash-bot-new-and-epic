const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');
const { createNowPlayingEmbed, createControlComponents } = require('../music/ui');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('nowplaying')
    .setDescription('Show details and interactive controls for the currently playing track'),

  aliases: ['np', 'nowplaying', 'current'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue || !queue.currentTrack) {
      return interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
    }

    const embed = createNowPlayingEmbed(queue.currentTrack, queue);
    const components = createControlComponents(queue);

    return interaction.reply({ embeds: [embed], components });
  },

  async executeMessage(message) {
    const queue = musicManager.get(message.guild.id);
    if (!queue || !queue.currentTrack) {
      return message.reply('❌ No music is currently playing!');
    }

    const embed = createNowPlayingEmbed(queue.currentTrack, queue);
    const components = createControlComponents(queue);

    return message.reply({ embeds: [embed], components });
  }
};
