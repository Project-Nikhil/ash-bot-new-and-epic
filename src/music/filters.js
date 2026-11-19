/**
 * FFmpeg Audio DSP Filters for Modern Sound Effects
 * Includes anti-clipping limiter (alimiter) to prevent distortion
 */
const AUDIO_FILTERS = {
  off: {
    name: 'Normal (Direct)',
    emoji: '🎵',
    description: 'Clean, original stream',
    ffmpeg: null,
    speedFactor: 1.0,
    cpuLoad: 'Very Low'
  },
  bassboost: {
    name: 'Bass Boost 10dB',
    emoji: '🔊',
    description: 'Deep low-end sub-bass with anti-clip protection',
    ffmpeg: 'equalizer=f=60:width_type=h:width=60:g=10,equalizer=f=120:width_type=h:width=80:g=6,alimiter=limit=0.95:attack=5:release=50',
    speedFactor: 1.0,
    cpuLoad: 'Low'
  },
  nightcore: {
    name: 'Nightcore 1.25x',
    emoji: '⚡',
    description: 'Higher pitch, faster BPM anime/club tempo',
    ffmpeg: 'asetrate=48000*1.25,aresample=48000,alimiter=limit=0.95:attack=5:release=50',
    speedFactor: 1.25,
    cpuLoad: 'Low'
  },
  '8d': {
    name: '8D Audio (Surround)',
    emoji: '🎧',
    description: 'Lightweight 360-degree rotating binaural spatial audio',
    ffmpeg: 'apulsator=hz=0.125,alimiter=limit=0.95:attack=5:release=50',
    speedFactor: 1.0,
    cpuLoad: 'Medium'
  },
  lofi: {
    name: 'Lo-Fi Chill & Warmth',
    emoji: '☕',
    description: 'Cozy tape-warmth with low-pass roll-off',
    ffmpeg: 'lowpass=f=3200,highpass=f=200,alimiter=limit=0.95:attack=5:release=50',
    speedFactor: 1.0,
    cpuLoad: 'Low'
  },
  vaporwave: {
    name: 'Vaporwave / Slowed',
    emoji: '🌆',
    description: 'Slowed, pitched down nostalgic retro aesthetic with room reverb',
    ffmpeg: 'asetrate=48000*0.85,aresample=48000,aecho=0.8:0.88:60:0.4,alimiter=limit=0.95:attack=5:release=50',
    speedFactor: 0.85,
    cpuLoad: 'Medium'
  }
};

module.exports = { AUDIO_FILTERS };
