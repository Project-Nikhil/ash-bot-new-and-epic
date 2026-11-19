const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { createAudioResource, StreamType } = require('@discordjs/voice');
const { isSpotifyUrl, getSpotifyTracks } = require('./spotify');
const { AUDIO_FILTERS } = require('./filters');
const config = require('../config');

// Temporary cookies file management
const COOKIES_PATH = path.join(__dirname, '..', '..', '.yt-cookies.txt');
if (config.youtubeCookies && !fs.existsSync(COOKIES_PATH)) {
  try {
    fs.writeFileSync(COOKIES_PATH, config.youtubeCookies, 'utf-8');
  } catch (err) {
    console.warn('[Track] Could not write temporary cookies file:', err.message);
  }
}

/**
 * Validates whether an input URL is safe (YouTube, YouTube Music, or Spotify only)
 * Rejects random web URLs or internal addresses
 * @param {string} input
 * @returns {boolean}
 */
function isAllowedUrl(input) {
  try {
    const parsed = new URL(input);
    const host = parsed.hostname.toLowerCase();
    const allowed = [
      'youtube.com',
      'www.youtube.com',
      'm.youtube.com',
      'music.youtube.com',
      'youtu.be',
      'open.spotify.com'
    ];
    return allowed.some(h => host === h || host.endsWith('.' + h));
  } catch {
    return false;
  }
}

/**
 * Returns common arguments for all yt-dlp invocations
 * @returns {string[]}
 */
function getYtdlBaseArgs() {
  const args = [
    '--js-runtimes', 'node',
    '--no-warnings',
    '--no-check-certificates',
    '--socket-timeout', '10'
  ];

  const cookieFile = config.youtubeCookiesPath || (fs.existsSync(COOKIES_PATH) ? COOKIES_PATH : null);
  if (cookieFile) {
    args.push('--cookies', cookieFile);
  }

  if (config.youtubeProxy) {
    args.push('--proxy', config.youtubeProxy);
  }

  return args;
}

/**
 * Format seconds into HH:MM:SS or MM:SS
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (seconds === null || seconds === undefined || isNaN(seconds) || seconds <= 0) {
    return '🔴 LIVE';
  }
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Parses stderr and returns a user-friendly error message
 * @param {string} stderr
 * @returns {string}
 */
function parseYtdlError(stderr) {
  const err = (stderr || '').toLowerCase();
  if (err.includes('sign in to confirm you\'re not a bot') || err.includes('confirm your age')) {
    return 'YouTube blocked this request with bot verification. Datacenter IP blocked. (Add YouTube cookies in Render env to resolve).';
  }
  if (err.includes('private video')) {
    return 'This video is private and cannot be played.';
  }
  if (err.includes('this video is not available') || err.includes('video unavailable')) {
    return 'This video is deleted or unavailable.';
  }
  if (err.includes('http error 403')) {
    return 'YouTube rejected stream access (HTTP 403 Forbidden).';
  }
  if (err.includes('premieres in') || err.includes('upcoming')) {
    return 'This video has not premiered yet.';
  }
  return stderr.trim().split('\n').pop() || 'Unknown stream extraction error';
}

class Track {
  constructor({ title, url, displayUrl, duration, durationFormatted, thumbnail, uploader, requestedBy, isLive = false }) {
    this.title = title || 'Unknown Title';
    this.url = url;
    this.displayUrl = displayUrl || url;
    this.duration = duration || 0;
    this.durationFormatted = durationFormatted || formatDuration(duration);
    this.thumbnail = thumbnail || null;
    this.uploader = uploader || 'Unknown Artist';
    this.requestedBy = requestedBy || null;
    this.isLive = Boolean(isLive || duration === 0);

    // References to active child processes for streaming
    this.activeYtdl = null;
    this.activeFfmpeg = null;
    this.directStreamUrl = null;
  }

  /**
   * Resolves a query or URL into Track object(s) safely
   * @param {string} query
   * @param {object} requestedBy - Discord user
   * @returns {Promise<Track[]>}
   */
  static async resolve(query, requestedBy) {
    const trimmed = query.trim();
    const isUrl = /^https?:\/\//i.test(trimmed);

    // Security check: Only allow YouTube & Spotify links
    if (isUrl && !isAllowedUrl(trimmed)) {
      throw new Error('Unsupported URL. Only YouTube, YouTube Music, and Spotify links (or search text) are supported.');
    }

    // 1. Check for Spotify URLs
    if (isSpotifyUrl(trimmed)) {
      const spotifyTracks = await getSpotifyTracks(trimmed);
      if (!spotifyTracks || spotifyTracks.length === 0) {
        throw new Error('No tracks found for this Spotify link.');
      }

      return spotifyTracks.map(st => new Track({
        title: st.title,
        url: `ytsearch1:${st.query}`,
        displayUrl: trimmed,
        duration: st.duration,
        durationFormatted: formatDuration(st.duration),
        thumbnail: st.thumbnail,
        uploader: st.artist,
        requestedBy
      }));
    }

    // 2. Resolve via yt-dlp
    return new Promise((resolve, reject) => {
      const target = isUrl ? trimmed : `ytsearch1:${trimmed}`;
      const args = [
        ...getYtdlBaseArgs(),
        '--dump-single-json',
        '--default-search', 'ytsearch',
        '--flat-playlist',
        '--playlist-end', String(config.maxPlaylistImport),
        target
      ];

      const proc = spawn('yt-dlp', args);
      let stdout = '';
      let stderr = '';

      const timeoutTimer = setTimeout(() => {
        try {
          proc.kill('SIGKILL');
        } catch {}
        reject(new Error('Playlist / search lookup timed out after 30 seconds.'));
      }, 30000);

      proc.stdout.on('data', (data) => {
        if (stdout.length < 10 * 1024 * 1024) {
          stdout += data.toString();
        }
      });
      proc.stderr.on('data', (data) => {
        if (stderr.length < 100 * 1024) {
          stderr += data.toString();
        }
      });

      proc.on('close', (code) => {
        clearTimeout(timeoutTimer);
        if (code !== 0) {
          return reject(new Error(parseYtdlError(stderr)));
        }

        try {
          const data = JSON.parse(stdout);
          const tracks = [];

          if (data._type === 'playlist' && Array.isArray(data.entries)) {
            for (const entry of data.entries) {
              if (!entry) continue;
              const dur = entry.duration || 0;
              const isLive = Boolean(entry.is_live || dur === 0);

              // Limit max track duration (3 hours)
              if (!isLive && dur > config.maxTrackDurationSeconds) continue;

              const trackUrl = entry.url || entry.webpage_url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : target);
              tracks.push(new Track({
                title: entry.title || 'Unknown Title',
                url: trackUrl,
                displayUrl: trackUrl,
                duration: dur,
                durationFormatted: formatDuration(dur),
                thumbnail: entry.thumbnails?.[0]?.url || entry.thumbnail || null,
                uploader: entry.uploader || entry.channel || 'Unknown Artist',
                requestedBy,
                isLive
              }));
            }
          } else {
            const dur = data.duration || 0;
            const isLive = Boolean(data.is_live || dur === 0);

            if (!isLive && dur > config.maxTrackDurationSeconds) {
              return reject(new Error(`Track duration (${formatDuration(dur)}) exceeds the 3-hour limit.`));
            }

            const trackUrl = data.webpage_url || data.url || target;
            tracks.push(new Track({
              title: data.title || 'Unknown Title',
              url: trackUrl,
              displayUrl: trackUrl,
              duration: dur,
              durationFormatted: formatDuration(dur),
              thumbnail: data.thumbnail || data.thumbnails?.[0]?.url || null,
              uploader: data.uploader || data.channel || 'Unknown Artist',
              requestedBy,
              isLive
            }));
          }

          if (tracks.length === 0) {
            return reject(new Error('No matching audio tracks found.'));
          }

          resolve(tracks);
        } catch (err) {
          reject(new Error(`Failed to parse track info: ${err.message}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`yt-dlp process failed: ${err.message}`));
      });
    });
  }

  /**
   * Search multiple results for query
   * @param {string} query
   * @param {object} requestedBy
   * @param {number} limit
   * @returns {Promise<Track[]>}
   */
  static async search(query, requestedBy, limit = 5) {
    return new Promise((resolve, reject) => {
      const target = `ytsearch${limit}:${query.trim()}`;
      const args = [
        ...getYtdlBaseArgs(),
        '--dump-single-json',
        '--flat-playlist',
        target
      ];

      const proc = spawn('yt-dlp', args, { timeout: 30000, killSignal: 'SIGKILL' });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(parseYtdlError(stderr)));

        try {
          const data = JSON.parse(stdout);
          const entries = data.entries || [data];
          const results = entries.slice(0, limit).map(entry => {
            const dur = entry.duration || 0;
            const trackUrl = entry.url || entry.webpage_url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);
            return new Track({
              title: entry.title || 'Unknown Track',
              url: trackUrl,
              displayUrl: trackUrl,
              duration: dur,
              durationFormatted: formatDuration(dur),
              thumbnail: entry.thumbnails?.[0]?.url || entry.thumbnail || null,
              uploader: entry.uploader || entry.channel || 'Unknown Artist',
              requestedBy,
              isLive: Boolean(entry.is_live || dur === 0)
            });
          });

          if (results.length === 0) return reject(new Error('No results found.'));
          resolve(results);
        } catch (err) {
          reject(new Error(`Could not parse search results: ${err.message}`));
        }
      });

      proc.on('error', (err) => reject(new Error(`Search process error: ${err.message}`)));
    });
  }

  /**
   * Auto-DJ Track Discovery based on Related Music Search
   * Avoids repeating tracks present in the recent history
   * @param {string} currentTitle
   * @param {string} currentArtist
   * @param {string[]} recentTitles - List of up to last 20 played titles
   * @param {object} requestedBy
   * @returns {Promise<Track|null>}
   */
  static async getRecommendation(currentTitle, currentArtist, recentTitles = [], requestedBy = null) {
    try {
      const cleanTitle = (currentTitle || '').replace(/[^\w\s]/gi, ' ').trim().slice(0, 30);
      const cleanArtist = (currentArtist || '').replace(/[^\w\s]/gi, ' ').trim().slice(0, 30);
      const searchQuery = cleanArtist ? `${cleanArtist} official audio` : `${cleanTitle} mix music`;

      const results = await Track.search(searchQuery, requestedBy, 6);
      const normalizedRecent = recentTitles.map(t => (t || '').toLowerCase().trim());

      // Pick the first track not in recently played history and not identical to current
      const freshPick = results.find(r => {
        const titleLower = r.title.toLowerCase().trim();
        const isRecent = normalizedRecent.some(recent => titleLower.includes(recent) || recent.includes(titleLower));
        const isCurrent = titleLower.includes(cleanTitle.toLowerCase());
        return !isRecent && !isCurrent;
      }) || results[0];

      return freshPick || null;
    } catch {
      return null;
    }
  }

  /**
   * Spawns yt-dlp piped to ffmpeg (with optional DSP audio filters & anti-clip limiter)
   * Supports mid-track position seeking and dynamic channel bitrate adaptation
   * @param {object} options
   * @param {number} options.initialVolume
   * @param {string} options.filterName
   * @param {number} options.seekSeconds
   * @param {number} options.targetBitrate - Target bitrate from voice channel (e.g. 64000 - 384000)
   * @returns {AudioResource}
   */
  createAudioResource({ initialVolume = 80, filterName = 'off', seekSeconds = 0, targetBitrate = 96000 } = {}) {
    this.cleanup();

    const ytdlArgs = [
      ...getYtdlBaseArgs(),
      '-o', '-',
      '-f', 'bestaudio[acodec=opus]/bestaudio[ext=m4a]/bestaudio/ba*',
      '--no-playlist',
      '--quiet',
      '--buffer-size', '64K'
    ];

    if (seekSeconds > 0) {
      // Direct stream seek forward via download-sections
      ytdlArgs.push('--download-sections', `*${Math.floor(seekSeconds)}-inf`);
    }

    ytdlArgs.push(this.url);

    // Dynamic bitrate capping
    const safeBitrate = Math.min(Math.max(64000, targetBitrate || 96000), 384000);
    const bitrateStr = `${Math.floor(safeBitrate / 1000)}k`;

    const activeFilter = AUDIO_FILTERS[filterName];
    const filterChain = [];

    if (activeFilter && activeFilter.ffmpeg) {
      filterChain.push(activeFilter.ffmpeg);
      // Anti-clipping limiter only needed when DSP filters are active
      filterChain.push('alimiter=limit=0.95:attack=5:release=50');
    }

    const ffmpegArgs = [
      '-i', 'pipe:0',
      '-analyzeduration', '0',
      '-loglevel', 'error'
    ];

    if (filterChain.length > 0) {
      ffmpegArgs.push('-af', filterChain.join(','));
    }

    ffmpegArgs.push(
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      'pipe:1'
    );

    const ytdlProc = spawn('yt-dlp', ytdlArgs, {
      stdio: ['ignore', 'pipe', 'pipe']
    });

    const ffmpegProc = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'pipe']
    });

    let ytdlStderr = '';
    let ffmpegStderr = '';

    ytdlProc.stderr.on('data', (d) => {
      if (ytdlStderr.length < 50000) ytdlStderr += d.toString();
    });
    ffmpegProc.stderr.on('data', (d) => {
      if (ffmpegStderr.length < 50000) ffmpegStderr += d.toString();
    });

    ytdlProc.stdout.pipe(ffmpegProc.stdin);

    // Prevent uncaught errors from crashing process
    ytdlProc.on('error', (err) => {
      console.error('[yt-dlp Spawn Error]:', err.message);
    });
    ffmpegProc.on('error', (err) => {
      console.error('[FFmpeg Spawn Error]:', err.message);
    });
    ytdlProc.stdout.on('error', () => {});
    ffmpegProc.stdin.on('error', () => {});
    ffmpegProc.stdout.on('error', () => {});

    // Scoped cleanup: only clean up if this was the active ffmpeg process
    ffmpegProc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        if (ffmpegStderr) console.error(`[FFmpeg Error Code ${code}]:`, ffmpegStderr.trim());
      }
      if (this.activeFfmpeg === ffmpegProc) {
        this.cleanup();
      }
    });

    ytdlProc.on('close', (code) => {
      if (code !== 0 && code !== null) {
        console.error(`[yt-dlp Stream Error Code ${code}]:`, parseYtdlError(ytdlStderr));
      }
    });

    this.activeYtdl = ytdlProc;
    this.activeFfmpeg = ffmpegProc;

    const resource = createAudioResource(ffmpegProc.stdout, {
      inputType: StreamType.Raw,
      inlineVolume: true
    });

    if (resource.volume) {
      resource.volume.setVolume(initialVolume / 100);
    }

    return resource;
  }

  /**
   * Cleanly terminates active child processes to prevent zombies and memory leaks
   */
  cleanup() {
    if (this.activeYtdl) {
      const proc = this.activeYtdl;
      this.activeYtdl = null;
      try {
        proc.stdout?.destroy();
        proc.stderr?.destroy();
        proc.kill('SIGKILL');
      } catch (_) {}
    }
    if (this.activeFfmpeg) {
      const proc = this.activeFfmpeg;
      this.activeFfmpeg = null;
      try {
        proc.stdin?.destroy();
        proc.stdout?.destroy();
        proc.kill('SIGKILL');
      } catch (_) {}
    }
  }
}

module.exports = {
  Track,
  formatDuration,
  isAllowedUrl,
  getYtdlBaseArgs
};
