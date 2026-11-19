const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const config = require('../config');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Display the bot information and all available commands'),

  aliases: ['help', 'h', 'commands'],

  async execute(interaction) {
    const embed = new EmbedBuilder()
      .setColor(0x00F0FF) // Cyber Neon Cyan
      .setAuthor({
        name: '⚡ ASH MUSIC • COMMANDS & HELP MENU',
        iconURL: interaction.client.user.displayAvatarURL()
      })
      .setTitle('🎧 Everything You Need to Know')
      .setDescription(
        '**Ash Music** is a high-performance Discord music bot with **24/7 Voice Channel mode**, **Spotify playlist support**, real-time **DSP Audio Filters**, and **Live Synced Lyrics**.\n\n' +
        '> 💡 All commands work with **Slash Commands (`/`)** and prefix commands (`!` or your server prefix)!'
      )
      .addFields(
        {
          name: '🎶 Playback Commands',
          value:
            '`/play <query>` (or `!p`) — Play song by name, YouTube link, or Spotify link\n' +
            '`/pause` — Pause current playback\n' +
            '`/resume` — Resume paused music\n' +
            '`/skip` (or `!s`) — Skip to the next track in queue\n' +
            '`/stop` (or `!dc`) — Stop music and clear the queue',
          inline: false
        },
        {
          name: '📜 Queue & Track Information',
          value:
            '`/nowplaying` (or `!np`) — Show current track details, progress bar & buttons\n' +
            '`/queue` (or `!q`) — View upcoming songs in queue\n' +
            '`/lyrics` (or `!ly`) — Display synchronized karaoke lyrics (via LRCLIB)',
          inline: false
        },
        {
          name: '🎛️ Audio Effects & Settings',
          value:
            '`/volume <1-100>` — Adjust playback volume\n' +
            '`/loop [mode]` — Repeat track, repeat queue, or turn off\n' +
            '`/filter <name>` — Apply Bass Boost, Nightcore, 8D Spatial, Lo-Fi, or Vaporwave\n' +
            '`/247 [enabled]` — Keep the bot inside your voice channel 24/7',
          inline: false
        },
        {
          name: '🚀 Quick Tips',
          value:
            '• **Spotify Links:** You can paste Spotify track, album, or playlist links directly into `/play`!\n' +
            '• **Interactive Controls:** Every song sends a Now Playing embed with live buttons for one-click pause, skip, loop, and audio filters.\n' +
            '• **24/7 Music:** Turn on `/247 true` if you want a dedicated radio channel that never disconnects.',
          inline: false
        }
      )
      .setFooter({
        text: `Prefix: ${config.prefix} • Ash Music v1.0 • Discord.js v14`,
        iconURL: 'https://cdn.discordapp.com/emojis/849993214477041705.webp?size=96&quality=lossless'
      })
      .setTimestamp();

    return interaction.reply({ embeds: [embed] });
  },

  async executeMessage(message) {
    const embed = new EmbedBuilder()
      .setColor(0x00F0FF)
      .setAuthor({
        name: '⚡ ASH MUSIC • COMMANDS & HELP MENU',
        iconURL: message.client.user.displayAvatarURL()
      })
      .setTitle('🎧 Everything You Need to Know')
      .setDescription(
        '**Ash Music** is a high-performance Discord music bot with **24/7 Voice Channel mode**, **Spotify playlist support**, real-time **DSP Audio Filters**, and **Live Synced Lyrics**.\n\n' +
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
            `\`${config.prefix}stop\` (\`${config.prefix}dc\`) — Stop music and clear queue`,
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
          name: '🎛️ Audio Effects & Settings',
          value:
            `\`${config.prefix}volume <1-100>\` — Adjust playback volume\n` +
            `\`${config.prefix}loop [mode]\` — Repeat track, queue, or off\n` +
            `\`${config.prefix}filter <name>\` — Apply Bass Boost, Nightcore, 8D, Lo-Fi, or Vaporwave\n` +
            `\`${config.prefix}247 [on/off]\` — Keep bot in voice channel 24/7`,
          inline: false
        },
        {
          name: '🚀 Quick Tips',
          value:
            '• **Spotify Links:** Paste any Spotify track, album, or playlist link directly!\n' +
            '• **Interactive Controls:** Every song sends a Now Playing embed with live buttons for one-click pause, skip, and filters.\n' +
            '• **24/7 Music:** Turn on 24/7 mode so the bot never disconnects.',
          inline: false
        }
      )
      .setFooter({
        text: `Prefix: ${config.prefix} • Ash Music v1.0 • Discord.js v14`
      })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }
};
