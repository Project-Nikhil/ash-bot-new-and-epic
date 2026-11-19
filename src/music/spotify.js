/**
 * Spotify Metadata Extractor
 * 
 * NOTE: Spotify audio is NOT streamed directly due to Spotify DRM.
 * The bot reads track metadata (title, artist, duration) via Spotify Web API,
 * and seamlessly streams the matched audio via yt-dlp on YouTube.
 */

const config = require('../config');

let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Gets a valid Spotify access token using Client Credentials
 * @returns {Promise<string|null>}
 */
async function getSpotifyToken() {
  if (!config.spotifyClientId || !config.spotifyClientSecret) {
    return null;
  }

  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60000) {
    return cachedToken;
  }

  try {
    const creds = Buffer.from(`${config.spotifyClientId}:${config.spotifyClientSecret}`).toString('base64');
    const res = await fetch('https://accounts.spotify.com/api/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${creds}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(5000)
    });

    if (!res.ok) {
      console.warn(`[Spotify Auth Error] Status: ${res.status}`);
      return null;
    }

    const data = await res.json();
    cachedToken = data.access_token;
    tokenExpiresAt = Date.now() + (data.expires_in * 1000);
    return cachedToken;
  } catch (err) {
    console.warn('[Spotify Auth Error]', err.message);
    return null;
  }
}

/**
 * Checks if a string is a Spotify URL
 * @param {string} url
 * @returns {boolean}
 */
function isSpotifyUrl(url) {
  return /^(https?:\/\/)?(open\.)?spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/i.test((url || '').trim());
}

/**
 * Parses a Spotify URL into type and ID
 * @param {string} url
 * @returns {{ type: 'track'|'album'|'playlist', id: string } | null}
 */
function parseSpotifyUrl(url) {
  const match = (url || '').trim().match(/spotify\.com\/(track|album|playlist)\/([a-zA-Z0-9]+)/i);
  if (!match) return null;
  return { type: match[1].toLowerCase(), id: match[2] };
}

/**
 * Fetches tracks from Spotify API (capped at config.maxPlaylistImport)
 * @param {string} url
 * @returns {Promise<Array<{ title: string, artist: string, duration: number, thumbnail: string|null, query: string }> | null>}
 */
async function getSpotifyTracks(url) {
  const parsed = parseSpotifyUrl(url);
  if (!parsed) return null;

  const token = await getSpotifyToken();
  if (!token) {
    throw new Error('Spotify API credentials are missing or invalid in .env.');
  }

  const headers = { Authorization: `Bearer ${token}` };

  if (parsed.type === 'track') {
    const res = await fetch(`https://api.spotify.com/v1/tracks/${parsed.id}`, {
      headers,
      signal: AbortSignal.timeout(5000)
    });
    if (!res.ok) throw new Error(`Spotify track lookup failed (status ${res.status})`);
    const track = await res.json();
    const artist = track.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
    const thumbnail = track.album?.images?.[0]?.url || null;

    return [{
      title: track.name,
      artist,
      duration: Math.floor((track.duration_ms || 0) / 1000),
      thumbnail,
      query: `${track.name} ${artist} audio`
    }];
  }

  if (parsed.type === 'album') {
    const res = await fetch(`https://api.spotify.com/v1/albums/${parsed.id}`, {
      headers,
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`Spotify album lookup failed (status ${res.status})`);
    const album = await res.json();
    const thumbnail = album.images?.[0]?.url || null;
    const items = (album.tracks?.items || []).slice(0, config.maxPlaylistImport || 100);

    return items.map(track => {
      const artist = track.artists?.map(a => a.name).join(', ') || album.artists?.[0]?.name || 'Unknown Artist';
      return {
        title: track.name,
        artist,
        duration: Math.floor((track.duration_ms || 0) / 1000),
        thumbnail,
        query: `${track.name} ${artist} audio`
      };
    });
  }

  if (parsed.type === 'playlist') {
    const res = await fetch(`https://api.spotify.com/v1/playlists/${parsed.id}?limit=${config.maxPlaylistImport || 100}`, {
      headers,
      signal: AbortSignal.timeout(8000)
    });
    if (!res.ok) throw new Error(`Spotify playlist lookup failed (status ${res.status})`);
    const playlist = await res.json();
    const items = (playlist.tracks?.items || []).slice(0, config.maxPlaylistImport || 100);

    const tracks = [];
    for (const item of items) {
      const track = item.track;
      if (!track) continue;
      const artist = track.artists?.map(a => a.name).join(', ') || 'Unknown Artist';
      const thumbnail = track.album?.images?.[0]?.url || playlist.images?.[0]?.url || null;
      tracks.push({
        title: track.name,
        artist,
        duration: Math.floor((track.duration_ms || 0) / 1000),
        thumbnail,
        query: `${track.name} ${artist} audio`
      });
    }
    return tracks;
  }

  return null;
}

module.exports = {
  isSpotifyUrl,
  parseSpotifyUrl,
  getSpotifyTracks
};
