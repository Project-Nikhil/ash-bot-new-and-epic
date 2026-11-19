const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { formatSeconds } = require('./ui');
const { AUDIO_FILTERS } = require('./filters');

// In-memory lyrics cache to prevent redundant external API hits
const lyricsCache = new Map();
const MAX_CACHE_SIZE = 100;

/**
 * Strips common YouTube/Release noise from track titles for cleaner lyric searches
 * e.g., "Starboy (Official Music Video) ft. Daft Punk" -> "Starboy"
 * @param {string} title
 * @returns {string}
 */
function cleanTrackTitle(title) {
  if (!title) return '';
  return title
    .replace(/[\(\[](?:official\s*(?:video|audio|music\s*video|lyric\s*video|visualizer)|lyrics?|hq|hd|4k|mv|remastered)[\)\]]/gi, '')
    .replace(/(?:ft\.|feat\.|featuring)\s+[^,\(\)\[\]]+/gi, '')
    .replace(/[\|–—].*$/, '') // remove trailing separators
    .trim();
}

/**
 * Parses LRC synchronized lyrics text into timestamped line objects
 * @param {string} lrcText
 * @returns {Array<{ time: number, text: string }>}
 */
function parseLrc(lrcText) {
  if (!lrcText) return [];
  const lines = lrcText.split('\n');
  const parsed = [];

  for (const line of lines) {
    const match = line.match(/\[(\d{2}):(\d{2})(?:\.(\d{2,3}))?\](.*)/);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const millis = match[3] ? parseInt(match[3].padEnd(3, '0').slice(0, 3), 10) : 0;
      const timeInSec = minutes * 60 + seconds + millis / 1000;
      const text = match[4].trim();
      parsed.push({ time: timeInSec, text });
    }
  }

  return parsed.sort((a, b) => a.time - b.time);
}

/**
 * Fetches lyrics from LRCLIB with 5-second timeout and in-memory cache
 * @param {string} title
 * @param {string} artist
 * @returns {Promise<{ synced: Array<{ time: number, text: string }>, plain: string, title: string, artist: string }|null>}
 */
async function getLyrics(title, artist = '') {
  const cleanTitle = cleanTrackTitle(title);
  const cleanArtist = artist?.replace(/ - Topic|VEVO/gi, '').trim() || '';
  const cacheKey = `${cleanTitle.toLowerCase()}:::${cleanArtist.toLowerCase()}`;

  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey);
  }

  // 1. Try exact get endpoint if artist is known
  if (cleanArtist) {
    try {
      const url = `https://lrclib.net/api/get?track_name=${encodeURIComponent(cleanTitle)}&artist_name=${encodeURIComponent(cleanArtist)}`;
      const res = await fetch(url, {
        headers: { 'User-Agent': 'AshDiscordBot/2.0 (music bot)' },
        signal: AbortSignal.timeout(5000)
      });
      if (res.ok) {
        const data = await res.json();
        if (data.syncedLyrics || data.plainLyrics) {
          const result = {
            synced: parseLrc(data.syncedLyrics),
            plain: data.plainLyrics || '',
            title: data.trackName || cleanTitle,
            artist: data.artistName || cleanArtist
          };
          if (lyricsCache.size >= MAX_CACHE_SIZE) lyricsCache.clear();
          lyricsCache.set(cacheKey, result);
          return result;
        }
      }
    } catch (_) {}
  }

  // 2. Fallback to broad search endpoint
  try {
    const searchQuery = cleanArtist ? `${cleanTitle} ${cleanArtist}` : cleanTitle;
    const searchUrl = `https://lrclib.net/api/search?q=${encodeURIComponent(searchQuery)}`;
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': 'AshDiscordBot/2.0 (music bot)' },
      signal: AbortSignal.timeout(5000)
    });
    if (res.ok) {
      const results = await res.json();
      if (Array.isArray(results) && results.length > 0) {
        const best = results.find(r => r.syncedLyrics) || results[0];
        const result = {
          synced: parseLrc(best.syncedLyrics),
          plain: best.plainLyrics || '',
          title: best.trackName || cleanTitle,
          artist: best.artistName || cleanArtist
        };
        if (lyricsCache.size >= MAX_CACHE_SIZE) lyricsCache.clear();
        lyricsCache.set(cacheKey, result);
        return result;
      }
    }
  } catch (_) {}

  return null;
}

/**
 * Builds the interactive live karaoke or full lyrics embed
 * @param {import('./Track').Track} track
 * @param {import('./MusicManager').GuildQueue} queue
 * @param {'live'|'full'} [viewMode='live']
 * @returns {Promise<{ embed: EmbedBuilder, components: ActionRowBuilder[] }>}
 */
async function buildLyricsPayload(track, queue, viewMode = 'live') {
  const lyricsData = await getLyrics(track.title, track.uploader);

  const embed = new EmbedBuilder()
    .setColor(0x00F0FF)
    .setAuthor({
      name: '🎙️ ASH LIVE KARAOKE • SYNCHRONIZED LYRICS',
      iconURL: 'https://cdn.discordapp.com/emojis/858857444144414740.webp?size=96&quality=lossless'
    })
    .setTitle(`🎶 ${lyricsData?.title || track.title} — ${lyricsData?.artist || track.uploader || 'Unknown'}`)
    .setTimestamp();

  if (track.thumbnail) {
    embed.setThumbnail(track.thumbnail);
  }

  if (!lyricsData || (!lyricsData.synced.length && !lyricsData.plain)) {
    embed
      .setColor(0xED4245)
      .setDescription(
        `❌ **No lyrics found for this track.**\n` +
        `Searched for: \`${track.title}\`\n\n` +
        `*Tip: Synced lyrics are community-sourced via LRCLIB. Obscure remixes or soundcloud bootlegs might not have lyrics available.*`
      );

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('music_lyrics_refresh')
        .setLabel('Retry Search')
        .setEmoji('🔄')
        .setStyle(ButtonStyle.Secondary)
    );

    return { embed, components: [row] };
  }

  // Adjust elapsed time by filter speed factor (Nightcore / Vaporwave)
  let elapsedSec = queue ? queue.getElapsedSeconds() : 0;
  const filterObj = AUDIO_FILTERS[queue?.activeFilter || 'off'];
  if (filterObj && filterObj.speedFactor && filterObj.speedFactor !== 1.0) {
    elapsedSec = Math.floor(elapsedSec * filterObj.speedFactor);
  }

  const hasSynced = lyricsData.synced.length > 0;

  if (hasSynced && viewMode === 'live') {
    let activeIndex = -1;
    for (let i = 0; i < lyricsData.synced.length; i++) {
      if (lyricsData.synced[i].time <= elapsedSec) {
        activeIndex = i;
      } else {
        break;
      }
    }

    const start = Math.max(0, activeIndex - 3);
    const end = Math.min(lyricsData.synced.length, activeIndex + 5);
    const windowLines = lyricsData.synced.slice(start, end);

    const formattedLines = windowLines.map((item, idx) => {
      const realIndex = start + idx;
      const timeTag = `\`[${formatSeconds(Math.floor(item.time))}]\``;
      const text = item.text || '♪ (Music) ♪';

      if (realIndex === activeIndex) {
        return `▶ 🎤 **${timeTag} ${text}**`;
      }
      return `${timeTag} ${text}`;
    });

    embed.setDescription(
      `⏱️ **Playback Position:** \`${formatSeconds(elapsedSec)} / ${track.durationFormatted}\`\n\n` +
      formattedLines.join('\n\n') +
      `\n\n*(Click **Sync / Next Line** as the song plays!)*`
    );
    embed.setFooter({ text: 'Mode: Live Synchronized Karaoke • LRCLIB' });
  } else {
    const textToShow = lyricsData.plain || lyricsData.synced.map(s => s.text).filter(Boolean).join('\n');
    const truncated = textToShow.length > 3900 ? textToShow.slice(0, 3900) + '\n\n*...[Lyrics truncated for length]*' : textToShow;

    embed.setDescription(truncated || '*(Instrumental / No lyrics)*');
    embed.setFooter({ text: 'Mode: Full Text Lyrics' });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('music_lyrics_refresh')
      .setLabel('Sync / Next Line')
      .setEmoji('🔄')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(!hasSynced),

    new ButtonBuilder()
      .setCustomId(`music_lyrics_toggle:${viewMode === 'live' ? 'full' : 'live'}`)
      .setLabel(viewMode === 'live' ? 'View Full Text' : 'View Live Karaoke')
      .setEmoji(viewMode === 'live' ? '📜' : '🎤')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(!hasSynced)
  );

  return { embed, components: [row] };
}

module.exports = {
  cleanTrackTitle,
  parseLrc,
  getLyrics,
  buildLyricsPayload
};
