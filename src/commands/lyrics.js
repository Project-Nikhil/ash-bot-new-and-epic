const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');
const { buildLyricsPayload } = require('../music/lyrics');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('lyrics')
    .setDescription('Display live synchronized or full text lyrics for the currently playing song'),

  aliases: ['lyrics', 'ly'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue || !queue.currentTrack) {
      return interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });
    const payload = await buildLyricsPayload(queue.currentTrack, queue, 'live');
    return interaction.editReply({ embeds: [payload.embed] });
  },

  async executeMessage(message) {
    const queue = musicManager.get(message.guild.id);
    if (!queue || !queue.currentTrack) {
      return message.reply('❌ No music is currently playing!');
    }

    const replyMsg = await message.reply('🔍 Fetching lyrics...').catch(() => null);
    const payload = await buildLyricsPayload(queue.currentTrack, queue, 'live');

    if (replyMsg) {
      return replyMsg.edit({ content: null, embeds: [payload.embed] });
    }
    return message.reply({ embeds: [payload.embed] });
  }
};
