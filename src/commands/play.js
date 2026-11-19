const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Track, formatDuration } = require('../music/Track');
const musicManager = require('../music/MusicManager');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('play')
    .setDescription('Play a song name, YouTube link, or Spotify track/album/playlist')
    .addStringOption(option =>
      option
        .setName('query')
        .setDescription('The song title, YouTube URL, or Spotify track/album/playlist link')
        .setRequired(true)
    ),

  aliases: ['p', 'play'],

  async execute(interaction) {
    const voiceChannel = interaction.member?.voice?.channel;
    if (!voiceChannel) {
      return interaction.reply({
        content: '❌ You must be in a voice channel to play music!',
        ephemeral: true
      });
    }

    const permissions = voiceChannel.permissionsFor(interaction.client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return interaction.reply({
        content: '❌ I need **Connect** and **Speak** permissions in your voice channel!',
        ephemeral: true
      });
    }

    await interaction.deferReply();

    const query = interaction.options.getString('query').trim();
    if (!query) {
      return interaction.editReply('❌ Please provide a song name or link to play.');
    }

    try {
      const tracks = await Track.resolve(query, interaction.user);
      const queue = musicManager.getOrCreate({
        guildId: interaction.guildId,
        voiceChannel,
        textChannel: interaction.channel
      });

      const result = queue.enqueue(tracks);

      if (result.queueFull) {
        return interaction.editReply({
          content: `⚠️ The queue is full (max ${config.maxQueueSize} songs). Please wait for some tracks to finish.`
        });
      }

      if (tracks.length === 1) {
        const track = tracks[0];
        const embed = new EmbedBuilder()
          .setColor(0x00F0FF)
          .setTitle('🎶 Added to Queue')
          .setDescription(`**[${track.title}](${track.displayUrl || track.url})**`)
          .addFields(
            { name: '⏱️ Duration', value: `\`${track.durationFormatted}\``, inline: true },
            { name: '👤 Artist / Channel', value: `\`${track.uploader || 'Unknown'}\``, inline: true },
            { name: '🙋 Requested By', value: `<@${interaction.user.id}>`, inline: true }
          );

        if (track.thumbnail) {
          embed.setThumbnail(track.thumbnail);
        }

        return interaction.editReply({ embeds: [embed] });
      }

      // Multi-track playlist (Spotify / YouTube playlist)
      const capNotes = [];
      if (result.playlistCapped) capNotes.push(`playlist capped at ${config.maxPlaylistImport}`);
      if (result.queueCapped) capNotes.push(`queue limit: ${config.maxQueueSize}`);
      const note = capNotes.length > 0 ? ` *(${capNotes.join(', ')})*` : '';

      const playlistEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('📚 Playlist Added to Queue')
        .setDescription(`Loaded **${result.addedCount} track(s)**${note} into the queue!`)
        .addFields(
          { name: '▶️ Next Up', value: `**${tracks[0].title}**`, inline: true },
          { name: '🙋 Requested By', value: `<@${interaction.user.id}>`, inline: true }
        );

      if (tracks[0]?.thumbnail) {
        playlistEmbed.setThumbnail(tracks[0].thumbnail);
      }

      return interaction.editReply({ embeds: [playlistEmbed] });
    } catch (err) {
      console.error('[Play Command Error]', err);
      return interaction.editReply(`❌ Could not load \`${query}\`: ${err.message}`);
    }
  },

  async executeMessage(message, args) {
    const voiceChannel = message.member?.voice?.channel;
    if (!voiceChannel) {
      return message.reply('❌ You must be in a voice channel to play music!');
    }

    const permissions = voiceChannel.permissionsFor(message.client.user);
    if (!permissions.has('Connect') || !permissions.has('Speak')) {
      return message.reply('❌ I need **Connect** and **Speak** permissions in your voice channel!');
    }

    const query = args.join(' ').trim();
    if (!query) {
      return message.reply('❌ Please provide a song name or link to play. Example: `!play starboy`');
    }

    const loadingMsg = await message.reply('🔍 Searching...').catch(() => null);

    try {
      const tracks = await Track.resolve(query, message.author);
      const queue = musicManager.getOrCreate({
        guildId: message.guild.id,
        voiceChannel,
        textChannel: message.channel
      });

      const result = queue.enqueue(tracks);

      if (result.queueFull) {
        const text = `⚠️ The queue is full (max ${config.maxQueueSize} songs). Please wait for current songs to finish.`;
        return loadingMsg ? loadingMsg.edit(text) : message.reply(text);
      }

      if (tracks.length === 1) {
        const track = tracks[0];
        const embed = new EmbedBuilder()
          .setColor(0x00F0FF)
          .setTitle('🎶 Added to Queue')
          .setDescription(`**[${track.title}](${track.displayUrl || track.url})**`)
          .addFields(
            { name: '⏱️ Duration', value: `\`${track.durationFormatted}\``, inline: true },
            { name: '👤 Artist / Channel', value: `\`${track.uploader || 'Unknown'}\``, inline: true },
            { name: '🙋 Requested By', value: `<@${message.author.id}>`, inline: true }
          );

        if (track.thumbnail) {
          embed.setThumbnail(track.thumbnail);
        }

        return loadingMsg ? loadingMsg.edit({ content: null, embeds: [embed] }) : message.reply({ embeds: [embed] });
      }

      const capNotes = [];
      if (result.playlistCapped) capNotes.push(`playlist capped at ${config.maxPlaylistImport}`);
      if (result.queueCapped) capNotes.push(`queue limit: ${config.maxQueueSize}`);
      const note = capNotes.length > 0 ? ` *(${capNotes.join(', ')})*` : '';

      const playlistEmbed = new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('📚 Playlist Added to Queue')
        .setDescription(`Loaded **${result.addedCount} track(s)**${note} into the queue!`)
        .addFields(
          { name: '▶️ Next Up', value: `**${tracks[0].title}**`, inline: true },
          { name: '🙋 Requested By', value: `<@${message.author.id}>`, inline: true }
        );

      if (tracks[0]?.thumbnail) {
        playlistEmbed.setThumbnail(tracks[0].thumbnail);
      }

      return loadingMsg ? loadingMsg.edit({ content: null, embeds: [playlistEmbed] }) : message.reply({ embeds: [playlistEmbed] });
    } catch (err) {
      console.error('[Play Message Error]', err);
      const text = `❌ Could not load \`${query}\`: ${err.message}`;
      return loadingMsg ? loadingMsg.edit(text) : message.reply(text);
    }
  }
};
