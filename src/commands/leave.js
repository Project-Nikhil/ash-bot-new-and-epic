const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');
const guildSettings = require('../music/GuildSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('leave')
    .setDescription('Disconnect the bot from the voice channel completely (forces departure)'),

  aliases: ['leave', 'dc', 'disconnect', 'bye'],

  async execute(interaction) {
    const queue = musicManager.get(interaction.guildId);
    if (!queue) {
      return interaction.reply({ content: '❌ I am not connected to any voice channel in this server!', ephemeral: true });
    }

    const memberVoice = interaction.member?.voice?.channel;
    if (queue.voiceChannel && (!memberVoice || memberVoice.id !== queue.voiceChannel.id)) {
      return interaction.reply({ content: `❌ You must be in the same voice channel (<#${queue.voiceChannel.id}>) to disconnect me!`, ephemeral: true });
    }

    // Force disconnect and turn off 24/7
    guildSettings.set(interaction.guildId, { stay247: false, voiceChannelId: null });
    queue.stop(true);

    return interaction.reply('👋 Left the voice channel and disabled 24/7 mode.');
  },

  async executeMessage(message) {
    const queue = musicManager.get(message.guild.id);
    if (!queue) {
      return message.reply('❌ I am not connected to any voice channel in this server!');
    }

    const memberVoice = message.member?.voice?.channel;
    if (queue.voiceChannel && (!memberVoice || memberVoice.id !== queue.voiceChannel.id)) {
      return message.reply(`❌ You must be in the same voice channel (<#${queue.voiceChannel.id}>) to disconnect me!`);
    }

    guildSettings.set(message.guild.id, { stay247: false, voiceChannelId: null });
    queue.stop(true);

    return message.reply('👋 Left the voice channel and disabled 24/7 mode.');
  }
};
