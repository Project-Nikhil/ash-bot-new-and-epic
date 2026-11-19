/**
 * FFmpeg Audio DSP Filters for Modern Sound Effects
 */
const AUDIO_FILTERS = {
  off: {
    name: 'Normal (Direct)',
    emoji: '🎵',
    description: 'Clean, original lossless master',
    ffmpeg: null
  },
  bassboost: {
    name: 'Bass Boost 10dB',
    emoji: '🔊',
    description: 'Deep, punchy low-end sub-bass frequencies',
    ffmpeg: 'equalizer=f=60:width_type=h:width=60:g=10,equalizer=f=120:width_type=h:width=80:g=6'
  },
  nightcore: {
    name: 'Nightcore 1.25x',
    emoji: '⚡',
    description: 'Higher pitch, faster BPM anime/club edit',
    ffmpeg: 'asetrate=48000*1.25,aresample=48000'
  },
  '8d': {
    name: '8D Audio (Surround)',
    emoji: '🎧',
    description: 'Dynamic 360-degree rotating binaural spatial audio',
    ffmpeg: 'apulsator=hz=0.125'
  },
  lofi: {
    name: 'Lo-Fi Chill & Warmth',
    emoji: '☕',
    description: 'Cozy tape-warmth with low-pass roll-off',
    ffmpeg: 'lowpass=f=3200,highpass=f=200'
  },
  vaporwave: {
    name: 'Vaporwave / Slowed + Reverb',
    emoji: '🌆',
    description: 'Slowed, pitched down nostalgic retro aesthetic',
    ffmpeg: 'asetrate=48000*0.82,aresample=48000,aecho=0.8:0.88:60:0.4'
  }
};

module.exports = { AUDIO_FILTERS };
