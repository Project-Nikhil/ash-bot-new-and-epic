const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');
const { AUDIO_FILTERS } = require('../music/filters');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('filter')
    .setDescription('Apply a real-time DSP audio filter (Bass Boost, Nightcore, 8D audio, etc.)')
    .addStringOption(option =>
      option
        .setName('name')
        .setDescription('Audio effect filter to apply')
        .setRequired(true)
        .addChoices(
          { name: 'Normal / Off (Standard)', value: 'off' },
          { name: 'Bass Boost (+10dB Lows)', value: 'bassboost' },
          { name: 'Nightcore (1.25x Speed & Pitch)', value: 'nightcore' },
          { name: '8D Spatial Audio (Surround Pan)', value: '8d' },
          { name: 'Lo-Fi Chill (Warm Analog)', value: 'lofi' },
          { name: 'Vaporwave (Slowed + Reverb)', value: 'vaporwave' }
        )
    ),

  aliases: ['filter', 'filters', 'fx', 'eq'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue || !queue.currentTrack) {
      return interaction.reply({ content: '❌ No music is currently playing to apply filters!', ephemeral: true });
    }

    const filterName = interaction.options.getString('name');
    const applied = await queue.setFilter(filterName);
    const info = AUDIO_FILTERS[applied] || AUDIO_FILTERS.off;

    return interaction.reply(`🎛️ Audio filter set to: \`${info.emoji} ${info.name}\``);
  },

  async executeMessage(message, args) {
    const queue = musicManager.get(message.guild.id);
    if (!queue || !queue.currentTrack) {
      return message.reply('❌ No music is currently playing to apply filters!');
    }

    const input = args[0]?.toLowerCase();
    if (!input || !AUDIO_FILTERS[input]) {
      const available = Object.keys(AUDIO_FILTERS).join(', ');
      return message.reply(`🎛️ Current filter: **${queue.activeFilter}**\nAvailable filters: \`${available}\`\nExample: \`!filter bassboost\``);
    }

    const applied = queue.setFilter(input);
    const info = AUDIO_FILTERS[applied] || AUDIO_FILTERS.off;
    return message.reply(`🎛️ Audio filter set to: \`${info.emoji} ${info.name}\``);
  }
};
