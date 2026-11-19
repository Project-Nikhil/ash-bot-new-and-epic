const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('loop')
    .setDescription('Set the loop mode (repeat track, repeat queue, or turn off)')
    .addStringOption(option =>
      option
        .setName('mode')
        .setDescription('Loop mode to set')
        .setRequired(false)
        .addChoices(
          { name: 'Off (No loop)', value: 'off' },
          { name: 'Track (Repeat current song)', value: 'track' },
          { name: 'Queue (Repeat entire queue)', value: 'queue' }
        )
    ),

  aliases: ['loop', 'repeat'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue) {
      return interaction.reply({ content: '❌ No active music session in this server!', ephemeral: true });
    }

    const mode = interaction.options.getString('mode');
    const newMode = queue.toggleLoop(mode);

    return interaction.reply(`🔁 Loop mode is now set to: **${newMode.toUpperCase()}**`);
  },

  async executeMessage(message, args) {
    const queue = musicManager.get(message.guild.id);
    if (!queue) {
      return message.reply('❌ No active music session in this server!');
    }

    const input = args[0]?.toLowerCase();
    let mode;
    if (['track', 'song', 'single', '1'].includes(input)) mode = 'track';
    else if (['queue', 'all'].includes(input)) mode = 'queue';
    else if (['off', 'disable', 'none', '0'].includes(input)) mode = 'off';

    const newMode = queue.toggleLoop(mode);
    return message.reply(`🔁 Loop mode is now set to: **${newMode.toUpperCase()}**`);
  }
};
