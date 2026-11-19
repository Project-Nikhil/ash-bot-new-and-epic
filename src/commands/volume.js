const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('volume')
    .setDescription('Change the audio playback volume (1% - 100%)')
    .addIntegerOption(option =>
      option
        .setName('level')
        .setDescription('Volume level between 1 and 100')
        .setMinValue(1)
        .setMaxValue(100)
        .setRequired(true)
    ),

  aliases: ['vol', 'volume'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue) {
      return interaction.reply({ content: '❌ No active music session in this server!', ephemeral: true });
    }

    const level = interaction.options.getInteger('level');
    queue.setVolume(level);

    return interaction.reply(`🔊 Volume set to **${level}%**.`);
  },

  async executeMessage(message, args) {
    const queue = musicManager.get(message.guild.id);
    if (!queue) {
      return message.reply('❌ No active music session in this server!');
    }

    const level = parseInt(args[0], 10);
    if (isNaN(level) || level < 1 || level > 100) {
      return message.reply(`🔊 Current volume is **${queue.volume}%**. To change it, type: \`!volume 1-100\``);
    }

    queue.setVolume(level);
    return message.reply(`🔊 Volume set to **${level}%**.`);
  }
};
