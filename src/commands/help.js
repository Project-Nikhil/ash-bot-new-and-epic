const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display bot information and the complete command directory'),

  aliases: ['help', 'h', 'commands'],

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x00F0FF)
      .setAuthor({
        name: '⚡ ASH MUSIC • COMMANDS & DIRECTORY',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTitle('🎧 High-Fidelity 24/7 Discord Music Bot')
      .setDescription(
        '**Ash** streams audio with **24/7 Voice Channel persistence**, **Spotify playlist conversion**, real-time **DSP Audio Filters**, and **Live Synced Karaoke Lyrics**.\n\n' +
        '> 💡 All commands work with **Slash Commands (`/`)** and prefix commands (`!` or your server prefix)!'
      )
      .addFields(
        {
          name: '🎶 Playback Commands',
          value:
            '`/play <query>` (or `!p`) — Play song name, YouTube URL, or Spotify track/album/playlist\n' +
            '`/pause` — Pause current playback\n' +
            '`/resume` — Resume paused music\n' +
            '`/skip` (or `!s`) — Skip to the next track\n' +
            '`/stop` — Clear queue and stop playback (stays in voice if 24/7 is enabled)\n' +
            '`/leave` (or `!dc`) — Completely disconnect the bot from voice and turn off 24/7',
          inline: false
        },
        {
          name: '📜 Queue & Track Information',
          value:
            '`/nowplaying` (or `!np`) — Show current track details, live progress bar & buttons\n' +
            '`/queue` (or `!q`) — View upcoming songs in queue\n' +
            '`/lyrics` (or `!ly`) — Display synchronized karaoke lyrics via LRCLIB',
          inline: false
        },
        {
          name: '🎛️ Audio Effects & Automation',
          value:
            '`/volume <1-100>` — Adjust playback volume\n' +
            '`/loop [mode]` — Repeat track, repeat queue, or turn off\n' +
            '`/filter <name>` — Apply Bass Boost, Nightcore, 8D Spatial, Lo-Fi, or Vaporwave\n' +
            '`/247 [enabled]` — Keep the bot inside your voice channel 24/7\n' +
            '`/autodj [enabled]` — Auto-queue related tracks when the queue runs dry',
          inline: false
        },
        {
          name: '🚀 Features & Notes',
          value:
            '• **Spotify Conversion:** Spotify tracks/playlists are resolved via YouTube search.\n' +
            '• **Anti-Clipping:** Audio filters include built-in limiters to prevent audio distortion.\n' +
            '• **24/7 Persistence:** Turn on `/247 true` to keep the bot connected permanently.',
          inline: false
        }
      )
      .setFooter({
        text: `Prefix: ${config.prefix} • Ash Music • Node.js Discord Bot`,
        iconURL: 'https://cdn.discordapp.com/emojis/849993214477041705.webp?size=96&quality=lossless'
      })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },

  async executeMessage(message) {
    const embed = new EmbedBuilder()
      .setColor(0x00F0FF)
      .setAuthor({
        name: '⚡ ASH MUSIC • COMMANDS & DIRECTORY',
        iconURL: message.client.user.displayAvatarURL()
      })
      .setTitle('🎧 High-Fidelity 24/7 Discord Music Bot')
      .setDescription(
        '**Ash** streams audio with **24/7 Voice Channel persistence**, **Spotify playlist conversion**, real-time **DSP Audio Filters**, and **Live Synced Karaoke Lyrics**.\n\n' +
        `> 💡 Use **Slash Commands (\`/\`)** or prefix commands with \`${config.prefix}\`!`
      )
      .addFields(
        {
          name: '🎶 Playback Commands',
          value:
            `\`${config.prefix}play <query>\` (\`${config.prefix}p\`) — Play song by name, YouTube, or Spotify link\n` +
            `\`${config.prefix}pause\` — Pause current playback\n` +
            `\`${config.prefix}resume\` — Resume paused music\n` +
            `\`${config.prefix}skip\` (\`${config.prefix}s\`) — Skip to next song\n` +
            `\`${config.prefix}stop\` — Stop playback (stays in voice if 24/7 is enabled)\n` +
            `\`${config.prefix}leave\` (\`${config.prefix}dc\`) — Force disconnect bot from voice`,
          inline: false
        },
        {
          name: '📜 Queue & Track Information',
          value:
            `\`${config.prefix}nowplaying\` (\`${config.prefix}np\`) — Show current track & interactive buttons\n` +
            `\`${config.prefix}queue\` (\`${config.prefix}q\`) — View upcoming songs\n` +
            `\`${config.prefix}lyrics\` (\`${config.prefix}ly\`) — Display live synced karaoke lyrics`,
          inline: false
        },
        {
          name: '🎛️ Audio Effects & Automation',
          value:
            `\`${config.prefix}volume <1-100>\` — Adjust playback volume\n` +
            `\`${config.prefix}loop [mode]\` — Repeat track, repeat queue, or off\n` +
            `\`${config.prefix}filter <name>\` — Apply Bass Boost, Nightcore, 8D, Lo-Fi, Vaporwave\n` +
            `\`${config.prefix}247 [enabled]\` — Keep bot in voice channel 24/7\n` +
            `\`${config.prefix}autodj [enabled]\` — Auto-queue related music when queue is empty`,
          inline: false
        }
      )
      .setFooter({
        text: `Prefix: ${config.prefix} • Ash Music • Discord.js v14`,
        iconURL: 'https://cdn.discordapp.com/emojis/849993214477041705.webp?size=96&quality=lossless'
      })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};
