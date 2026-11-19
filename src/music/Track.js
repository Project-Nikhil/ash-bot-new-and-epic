const { spawn } = require('child_process');
const { createAudioResource, StreamType } = require('@discordjs/voice');
const { isSpotifyUrl, getSpotifyTracks } = require('./spotify');
const { AUDIO_FILTERS } = require('./filters');

/**
 * Format seconds into HH:MM:SS or MM:SS
 * @param {number} seconds
 * @returns {string}
 */
function formatDuration(seconds) {
  if (!seconds || isNaN(seconds)) return 'Live / Unknown';
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hrs > 0) {
    return `${hrs}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  }
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

class Track {
  constructor({ title, url, displayUrl, duration, durationFormatted, thumbnail, uploader, requestedBy }) {
    this.title = title;
    this.url = url;
    this.displayUrl = displayUrl || url;
    this.duration = duration;
    this.durationFormatted = durationFormatted;
    this.thumbnail = thumbnail;
    this.uploader = uploader;
    this.requestedBy = requestedBy;

    // References to active child processes for streaming
    this.activeYtdl = null;
    this.activeFfmpeg = null;
  }

  /**
   * Resolves a query or URL into Track object(s) using Spotify API or yt-dlp
   * @param {string} query
   * @param {object} requestedBy - Discord user
   * @returns {Promise<Track[]>}
   */
  static async resolve(query, requestedBy) {
    // 1. Check for Spotify URLs
    if (isSpotifyUrl(query)) {
      const spotifyTracks = await getSpotifyTracks(query);
      if (!spotifyTracks || spotifyTracks.length === 0) {
        throw new Error('No tracks found for this Spotify link.');
      }

      return spotifyTracks.map(st => new Track({
        title: st.title,
        url: `ytsearch1:${st.query}`,
        displayUrl: query,
        duration: st.duration,
        durationFormatted: formatDuration(st.duration),
        thumbnail: st.thumbnail,
        uploader: st.artist,
        requestedBy
      }));
    }

    // 2. Resolve via yt-dlp (YouTube, SoundCloud, direct audio URLs, etc.)
    return new Promise((resolve, reject) => {
      const isUrl = /^https?:\/\//i.test(query.trim());
      const target = isUrl ? query.trim() : `ytsearch1:${query.trim()}`;

      const args = [
        '--dump-single-json',
        '--no-warnings',
        '--default-search', 'ytsearch',
        '--flat-playlist',
        target
      ];

      const proc = spawn('yt-dlp', args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          return reject(new Error(stderr.trim() || `yt-dlp exited with code ${code}`));
        }

        try {
          const data = JSON.parse(stdout);
          const tracks = [];

          // If result is a playlist / multi-item result
          if (data._type === 'playlist' && Array.isArray(data.entries)) {
            for (const entry of data.entries) {
              if (!entry) continue;
              const trackUrl = entry.url || entry.webpage_url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : target);
              tracks.push(new Track({
                title: entry.title || 'Unknown Title',
                url: trackUrl,
                displayUrl: trackUrl,
                duration: entry.duration || 0,
                durationFormatted: formatDuration(entry.duration),
                thumbnail: entry.thumbnails?.[0]?.url || entry.thumbnail || null,
                uploader: entry.uploader || entry.channel || 'Unknown Artist',
                requestedBy
              }));
            }
          } else {
            // Single video / track
            const trackUrl = data.webpage_url || data.url || target;
            tracks.push(new Track({
              title: data.title || 'Unknown Title',
              url: trackUrl,
              displayUrl: trackUrl,
              duration: data.duration || 0,
              durationFormatted: formatDuration(data.duration),
              thumbnail: data.thumbnail || data.thumbnails?.[0]?.url || null,
              uploader: data.uploader || data.channel || 'Unknown Artist',
              requestedBy
            }));
          }

          if (tracks.length === 0) {
            return reject(new Error('No matching audio tracks found.'));
          }

          resolve(tracks);
        } catch (err) {
          reject(new Error(`Failed to parse track information: ${err.message}`));
        }
      });

      proc.on('error', (err) => {
        reject(new Error(`Failed to run yt-dlp: ${err.message}`));
      });
    });
  }

  /**
   * Search for top N tracks and return metadata for interactive selection
   * @param {string} query
   * @param {object} requestedBy
   * @param {number} limit
   * @returns {Promise<Track[]>}
   */
  static async search(query, requestedBy, limit = 5) {
    return new Promise((resolve, reject) => {
      const target = `ytsearch${limit}:${query.trim()}`;
      const args = [
        '--dump-single-json',
        '--no-warnings',
        '--flat-playlist',
        target
      ];

      const proc = spawn('yt-dlp', args);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => { stdout += d.toString(); });
      proc.stderr.on('data', (d) => { stderr += d.toString(); });

      proc.on('close', (code) => {
        if (code !== 0) return reject(new Error(stderr.trim() || `Search exited with code ${code}`));

        try {
          const data = JSON.parse(stdout);
          const entries = data.entries || [data];
          const results = entries.slice(0, limit).map(entry => {
            const trackUrl = entry.url || entry.webpage_url || (entry.id ? `https://www.youtube.com/watch?v=${entry.id}` : null);
            return new Track({
              title: entry.title || 'Unknown Track',
              url: trackUrl,
              displayUrl: trackUrl,
              duration: entry.duration || 0,
              durationFormatted: formatDuration(entry.duration),
              thumbnail: entry.thumbnails?.[0]?.url || entry.thumbnail || null,
              uploader: entry.uploader || entry.channel || 'Unknown Artist',
              requestedBy
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
   * Smart AI Auto-DJ Recommendation
   * Finds a related high-energy song based on previous track title
   * @param {string} currentTitle
   * @param {object} requestedBy
   * @returns {Promise<Track|null>}
   */
  static async getRecommendation(currentTitle, requestedBy) {
    try {
      const cleanTitle = currentTitle.replace(/[^\w\s]/gi, '').slice(0, 40);
      const results = await Track.search(`${cleanTitle} mix music audio`, requestedBy, 3);
      // Pick a result that doesn't share identical title
      const pick = results.find(r => !r.title.toLowerCase().includes(cleanTitle.toLowerCase())) || results[0];
      return pick || null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Spawns yt-dlp piped to ffmpeg (with optional DSP audio filters) and returns an AudioResource
   * @param {number} initialVolume
   * @param {string} filterName
   * @returns {AudioResource}
   */
  createAudioResource(initialVolume = 80, filterName = 'off') {
    this.cleanup();

    const ytdlArgs = [
      '-o', '-',
      '-f', 'bestaudio[acodec=opus]/bestaudio[ext=m4a]/bestaudio/ba*',
      '--no-playlist',
      '--quiet',
      '--buffer-size', '64K',
      this.url
    ];

    const ffmpegArgs = [
      '-reconnect', '1',
      '-reconnect_streamed', '1',
      '-reconnect_delay_max', '5',
      '-i', 'pipe:0',
      '-analyzeduration', '0',
      '-loglevel', '0'
    ];

    // Audio DSP Filter & High-Fidelity Resampling
    const activeFilter = AUDIO_FILTERS[filterName];
    const filterChain = [];

    if (activeFilter && activeFilter.ffmpeg) {
      filterChain.push(activeFilter.ffmpeg);
    }

    // High-precision 48kHz studio audio resampling to prevent artifacts and clipping
    filterChain.push('aresample=48000:precision=28:cheby=1');

    if (filterChain.length > 0) {
      ffmpegArgs.push('-af', filterChain.join(','));
    }

    ffmpegArgs.push(
      '-f', 's16le',
      '-ar', '48000',
      '-ac', '2',
      '-b:a', '384k',
      'pipe:1'
    );

    const ytdlProc = spawn('yt-dlp', ytdlArgs, {
      stdio: ['ignore', 'pipe', 'ignore']
    });

    const ffmpegProc = spawn('ffmpeg', ffmpegArgs, {
      stdio: ['pipe', 'pipe', 'ignore']
    });

    ytdlProc.stdout.pipe(ffmpegProc.stdin);

    // Prevent uncaught errors from crashing process if pipe breaks
    ytdlProc.on('error', () => {});
    ytdlProc.stdout.on('error', () => {});
    ffmpegProc.on('error', () => {});
    ffmpegProc.stdin.on('error', () => {});
    ffmpegProc.stdout.on('error', () => {});

    // Ensure both processes terminate cleanly if either exits early
    ffmpegProc.on('close', () => {
      try { ytdlProc.kill('SIGKILL'); } catch (_) {}
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
   * Kills any running child processes and destroys streams for this track
   */
  cleanup() {
    if (this.activeYtdl) {
      try {
        this.activeYtdl.stdout?.unpipe();
        this.activeYtdl.stdout?.destroy();
        this.activeYtdl.kill('SIGKILL');
      } catch (_) {}
      this.activeYtdl = null;
    }
    if (this.activeFfmpeg) {
      try {
        this.activeFfmpeg.stdin?.destroy();
        this.activeFfmpeg.stdout?.destroy();
        this.activeFfmpeg.kill('SIGKILL');
      } catch (_) {}
      this.activeFfmpeg = null;
    }
  }
}

module.exports = { Track, formatDuration };
