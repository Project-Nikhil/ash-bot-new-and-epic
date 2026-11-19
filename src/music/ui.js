const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder
} = require('discord.js');
const config = require('../config');
const { AUDIO_FILTERS } = require('./filters');
const guildSettings = require('./GuildSettings');

/**
 * Formats seconds into MM:SS or HH:MM:SS
 * @param {number} seconds
 * @returns {string}
 */
function formatSeconds(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Creates a sleek cyber visual progress bar
 * @param {number} elapsedSec
 * @param {number} totalSec
 * @param {number} size
 * @returns {string}
 */
function createProgressBar(elapsedSec, totalSec, size = 14) {
  if (!totalSec || totalSec <= 0) {
    return '`🔴 LIVE / STREAM`';
  }

  const progress = Math.min(1, Math.max(0, elapsedSec / totalSec));
  const progressIndex = Math.round(size * progress);

  let bar = '';
  for (let i = 0; i < size; i++) {
    if (i === progressIndex) {
      bar += '🔘';
    } else if (i < progressIndex) {
      bar += '━';
    } else {
      bar += '─';
    }
  }

  return `\`${formatSeconds(elapsedSec)}\` ${bar} \`${formatSeconds(totalSec)}\``;
}

/**
 * Formats a track title with a markdown link if a valid HTTP URL exists
 * @param {import('./Track').Track} track
 * @returns {string}
 */
function formatTrackTitle(track) {
  const url = track.displayUrl || track.url;
  const title = track.title.slice(0, 140);
  if (url && url.length <= 240 && /^https?:\/\//i.test(url)) {
    return `**[${title}](${url})**`;
  }
  return `**${title}**`;
}

/**
 * Creates the Idle Dashboard Embed for the Dedicated Music Channel
 * @param {string} guildId
 * @returns {EmbedBuilder}
 */
function createIdleDashboardEmbed(guildId) {
  const settings = guildSettings.get(guildId);
  const is247 = settings.stay247;

  return new EmbedBuilder()
    .setColor(0x2B2D31)
    .setAuthor({
      name: '⚡ ASH MUSIC DASHBOARD • STANDBY',
      iconURL: 'https://cdn.discordapp.com/emojis/858857444144414740.webp?size=96&quality=lossless'
    })
    .setTitle('🎧 No Song Currently Playing')
    .setDescription(
      'Join any **Voice Channel** and simply **type a song name or paste a link** right here in this channel!\n\n' +
      '> 💡 **No commands needed!** Just type `Starboy` or paste a YouTube / Spotify URL.\n' +
      '> 🧹 Messages are automatically cleaned to keep this player sleek.\n' +
      '> 📏 **Limits:** Max `15` songs in queue • Max `15` songs per playlist'
    )
    .setImage('https://raw.githubusercontent.com/andreasbm/readme/master/assets/lines/aqua.png')
    .addFields(
      { name: '📻 24/7 VC Mode', value: is247 ? '`🟢 ENABLED`' : '`⚪ DISABLED`', inline: true },
      { name: '📡 Audio Engine', value: '`48kHz Stereo DSP`', inline: true },
      { name: '🎵 Supported', value: '`YouTube • Spotify • SoundCloud`', inline: true }
    )
    .setFooter({ text: 'Ash Music System • Pinned Live Controller' });
}

/**
 * Creates the Active Dashboard Embed for the Dedicated Music Channel (includes up-next preview)
 * @param {import('./MusicManager').GuildQueue} queue
 * @returns {EmbedBuilder}
 */
function createDashboardEmbed(queue) {
  const track = queue.currentTrack;
  if (!track) {
    return createIdleDashboardEmbed(queue.guildId);
  }

  const embed = createNowPlayingEmbed(track, queue);

  // Append Up Next queue preview directly inside the pinned dashboard
  if (queue.tracks.length > 0) {
    const upNext = queue.tracks
      .slice(0, 5)
      .map((t, i) => `\`${i + 1}.\` ${t.title.slice(0, 45)} \`[${t.durationFormatted}]\``)
      .join('\n');
    const more = queue.tracks.length > 5 ? `\n*...and ${queue.tracks.length - 5} more song(s)*` : '';
    embed.addFields({
      name: `📜 Up Next (${queue.tracks.length} queued)`,
      value: `${upNext}${more}`,
      inline: false
    });
  } else {
    embed.addFields({
      name: '📜 Up Next',
      value: queue.autoDj
        ? '`🤖 AI Auto-DJ will pick the next song automatically`'
        : '`Queue is empty — type a song name below to add more!`',
      inline: false
    });
  }

  return embed;
}

/**
 * Creates the modern AI Now Playing embed
 * @param {import('./Track').Track} track
 * @param {import('./MusicManager').GuildQueue} queue
 * @returns {EmbedBuilder}
 */
function createNowPlayingEmbed(track, queue) {
  const filterKey = queue.activeFilter || 'off';
  const filterInfo = AUDIO_FILTERS[filterKey] || AUDIO_FILTERS.off;
  const elapsed = queue.getElapsedSeconds();
  const progressBar = createProgressBar(elapsed, track.duration);
  const settings = guildSettings.get(queue.guildId);

  const safeTitle = (track.title || 'Unknown Track').slice(0, 240);
  const safeUploader = (track.uploader || 'Unknown').slice(0, 100);
  const safeUrl = track.displayUrl && /^https?:\/\//i.test(track.displayUrl) ? track.displayUrl : undefined;

  const embed = new EmbedBuilder()
    .setColor(0x00F0FF) // Cyber Neon Cyan
    .setAuthor({
      name: '⚡ ASH AUDIO ENGINE • LIVE PLAYBACK',
      iconURL: 'https://cdn.discordapp.com/emojis/858857444144414740.webp?size=96&quality=lossless'
    })
    .setTitle(`🎶 ${safeTitle}`)
    .setURL(safeUrl)
    .setDescription(
      `> 👤 **Artist:** \`${safeUploader}\`\n` +
      `> 📡 **Source:** \`${track.displayUrl?.includes('spotify') ? 'Spotify Premium API' : 'Direct Lossless PCM'}\`\n\n` +
      `${progressBar}\n`
    )
    .addFields(
      { name: '🎛️ Audio Filter', value: `\`${filterInfo.emoji} ${filterInfo.name}\``, inline: true },
      { name: '🔊 Volume', value: `\`${queue.volume}%\``, inline: true },
      { name: '🔁 Loop Mode', value: `\`${queue.loopMode.toUpperCase()}\``, inline: true },
      { name: '🤖 AI Auto-DJ', value: queue.autoDj ? '`🟢 ACTIVE`' : '`⚪ OFF`', inline: true },
      { name: '📻 24/7 Mode', value: settings.stay247 ? '`🟢 ON`' : '`⚪ OFF`', inline: true },
      { name: '🙋 Requested By', value: `<@${track.requestedBy?.id || track.requestedBy}>`, inline: true }
    )
    .setFooter({
      text: `DSP Sample Rate: 48,000Hz • Opus 320kbps • Ash Music Controller`,
      iconURL: 'https://cdn.discordapp.com/emojis/849993214477041705.webp?size=96&quality=lossless'
    })
    .setTimestamp();

  if (track.thumbnail) {
    embed.setImage(track.thumbnail);
  }

  return embed;
}

/**
 * Creates modern interactive action rows (Controls, Filter Select, Utilities)
 * @param {import('./MusicManager').GuildQueue|null} queue
 * @param {string} [guildId]
 * @returns {ActionRowBuilder[]}
 */
function createControlComponents(queue, guildId = null) {
  const isIdle = !queue || !queue.currentTrack;
  const isPaused = queue ? queue.isPaused : false;
  const loopMode = queue ? queue.loopMode : 'off';
  const autoDj = queue ? queue.autoDj : false;
  const currentFilter = queue ? (queue.activeFilter || 'off') : 'off';
  const gId = queue?.guildId || guildId;
  const is247 = gId ? guildSettings.get(gId).stay247 : false;

  // Row 1: Primary Playback Controls
  const playbackRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_toggle_pause')
      .setLabel(isPaused ? 'Resume' : 'Pause')
      .setEmoji(isPaused ? '▶️' : '⏸️')
      .setStyle(isPaused ? ButtonStyle.Success : ButtonStyle.Primary)
      .setDisabled(isIdle),

    new ButtonBuilder()
      .setCustomId('music_skip')
      .setLabel('Skip')
      .setEmoji('⏭️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isIdle),

    new ButtonBuilder()
      .setCustomId('music_loop')
      .setLabel(`Loop: ${loopMode.toUpperCase()}`)
      .setEmoji('🔁')
      .setStyle(loopMode !== 'off' ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(isIdle),

    new ButtonBuilder()
      .setCustomId('music_queue')
      .setLabel('Queue')
      .setEmoji('📜')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isIdle),

    new ButtonBuilder()
      .setCustomId('music_stop')
      .setLabel('Stop')
      .setEmoji('⏹️')
      .setStyle(ButtonStyle.Danger)
      .setDisabled(!queue)
  );

  // Row 2: Audio DSP Filter Dropdown
  const filterSelect = new StringSelectMenuBuilder()
    .setCustomId('music_filter_select')
    .setPlaceholder(`🎛️ Audio FX Filter: ${AUDIO_FILTERS[currentFilter]?.name || 'Normal'}`)
    .setDisabled(isIdle)
    .addOptions(
      Object.entries(AUDIO_FILTERS).map(([key, filter]) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(filter.name)
          .setValue(key)
          .setDescription(filter.description)
          .setEmoji(filter.emoji)
          .setDefault(key === currentFilter)
      )
    );
  const filterRow = new ActionRowBuilder().addComponents(filterSelect);

  // Row 3: Quick Utilities, Auto-DJ & 24/7 Mode Toggle
  const utilityRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_vol_down')
      .setLabel('-10%')
      .setEmoji('🔉')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isIdle),

    new ButtonBuilder()
      .setCustomId('music_vol_up')
      .setLabel('+10%')
      .setEmoji('🔊')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isIdle),

    new ButtonBuilder()
      .setCustomId('music_autodj_toggle')
      .setLabel(`Auto-DJ: ${autoDj ? 'ON' : 'OFF'}`)
      .setEmoji('🤖')
      .setStyle(autoDj ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setDisabled(!queue),

    new ButtonBuilder()
      .setCustomId('music_247_toggle')
      .setLabel(`24/7: ${is247 ? 'ON' : 'OFF'}`)
      .setEmoji('📻')
      .setStyle(is247 ? ButtonStyle.Success : ButtonStyle.Secondary),

    new ButtonBuilder()
      .setCustomId('music_lyrics')
      .setLabel('Lyrics')
      .setEmoji('🎙️')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(isIdle)
  );

  return [playbackRow, filterRow, utilityRow];
}

/**
 * Creates an embed displaying the music queue
 * @param {import('./MusicManager').GuildQueue} queue
 * @returns {EmbedBuilder}
 */
function createQueueEmbed(queue) {
  const embed = new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({ name: `🎵 Server Queue • ${queue.voiceChannel.guild.name}` });

  const current = queue.currentTrack;
  if (current) {
    const elapsed = queue.getElapsedSeconds();
    embed.addFields({
      name: '▶️ Currently Playing',
      value: `${formatTrackTitle(current)}\n⏱️ \`${formatSeconds(elapsed)} / ${current.durationFormatted}\` • <@${current.requestedBy?.id || current.requestedBy}>`
    });
  }

  if (queue.tracks.length === 0) {
    embed.setDescription(
      '```ansi\n\u001b[30;1m[Queue is empty]\u001b[0m\nUse /play to add a song.\n```' +
      (queue.autoDj ? '\n✨ *AI Auto-DJ is active! When this song ends, related tracks will automatically queue.*' : '')
    );
  } else {
    const list = queue.tracks
      .slice(0, 8)
      .map((t, index) => `\`${index + 1}.\` ${formatTrackTitle(t)} \`[${t.durationFormatted}]\` • <@${t.requestedBy?.id || t.requestedBy}>`)
      .join('\n');

    const extra = queue.tracks.length > 8 ? `\n*...and ${queue.tracks.length - 8} more track(s)*` : '';
    embed.setDescription(`**Upcoming Songs (${queue.tracks.length}/${config.maxQueueSize}):**\n\n${list}${extra}`);
  }

  embed.setFooter({
    text: `Loop: ${queue.loopMode.toUpperCase()} • Filter: ${queue.activeFilter.toUpperCase()} • Vol: ${queue.volume}% • Auto-DJ: ${queue.autoDj ? 'ON' : 'OFF'}`
  });

  return embed;
}

module.exports = {
  createNowPlayingEmbed,
  createControlComponents,
  createQueueEmbed,
  createIdleDashboardEmbed,
  createDashboardEmbed,
  formatTrackTitle,
  formatSeconds,
  createProgressBar
};
