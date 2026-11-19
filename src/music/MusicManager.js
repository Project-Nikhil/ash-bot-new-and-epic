const {
  joinVoiceChannel,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus
} = require('@discordjs/voice');
const config = require('../config');
const guildSettings = require('./GuildSettings');
const { Track } = require('./Track');
const { AUDIO_FILTERS } = require('./filters');

class GuildQueue {
  constructor({ manager, guildId, voiceChannel, textChannel }) {
    this.manager = manager;
    this.guildId = guildId;
    this.voiceChannel = voiceChannel;
    this.textChannel = textChannel;

    this.tracks = [];
    this.currentTrack = null;
    this.volume = config.defaultVolume;
    this.loopMode = 'off';
    this.isPaused = false;
    this.destroyed = false;
    this.idleTimer = null;
    this.aloneTimer = null;
    this.pausedDueToAlone = false;
    this.currentResource = null;
    this.recommendationRequest = null;
    this.skipRepeat = false;
    this.bufferTimer = null;

    this.activeFilter = 'off';
    this.autoDj = false;
    this.recentTracks = [];
    this.playbackStartTime = null;
    this.pausedAt = null;
    this.totalPausedDuration = 0;

    this.disconnectTimer = null;

    // Load persisted settings
    const saved = guildSettings.get(guildId);
    if (saved) {
      if (typeof saved.volume === 'number') this.volume = saved.volume;
      if (saved.loopMode) this.loopMode = saved.loopMode;
      if (saved.activeFilter) this.activeFilter = saved.activeFilter;
      if (typeof saved.autoDj === 'boolean') this.autoDj = saved.autoDj;
    }

    this.player = createAudioPlayer();
    this.setupPlayerListeners();
    this.connect();
    guildSettings.set(this.guildId, {
      voiceChannelId: this.voiceChannel.id,
      textChannelId: this.textChannel?.id || null
    });
  }

  connect() {
    if (this.connection && this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
      this.connection.rejoin({ channelId: this.voiceChannel.id });
      this.connection.subscribe(this.player);
      return;
    }

    const connection = joinVoiceChannel({
      channelId: this.voiceChannel.id,
      guildId: this.guildId,
      adapterCreator: this.voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true
    });
    this.connection = connection;
    connection.on('error', error => {
      console.warn(`[Voice] Guild ${this.guildId}: ${error.message}`);
    });
    const onStateChange = (_, state) => {
      if (state.status === VoiceConnectionStatus.Destroyed) {
        connection.off('stateChange', onStateChange);
      }
      if (this.destroyed || this.connection !== connection) return;
      clearTimeout(this.disconnectTimer);
      if (guildSettings.get(this.guildId).stay247) return;
      if (state.status === VoiceConnectionStatus.Destroyed) {
        this.destroy();
      } else if (state.status === VoiceConnectionStatus.Disconnected) {
        this.disconnectTimer = setTimeout(() => {
          if (!guildSettings.get(this.guildId).stay247) this.destroy();
        }, 5000);
      }
    };
    connection.on('stateChange', onStateChange);
    connection.subscribe(this.player);
    onStateChange(null, connection.state);
  }

  setupPlayerListeners() {
    this.player.on('stateChange', (_, state) => {
      clearTimeout(this.bufferTimer);
      if (state.status === AudioPlayerStatus.Buffering) {
        this.bufferTimer = setTimeout(() => {
          if (this.player.state.resource !== state.resource) return;
          console.warn(`[Playback] Guild ${this.guildId}: timed out waiting for audio`);
          this.skip();
        }, 30000);
      }
    });
    this.player.on(AudioPlayerStatus.Playing, () => {
      if (this.isPaused) this.player.pause();
    });
    this.player.on(AudioPlayerStatus.Idle, old => {
      this.handleTrackEnd(old.resource).catch(error => console.error('[Track end]', error));
    });

    this.player.on('error', (error) => {
      console.error(`[AudioPlayer Error] in guild ${this.guildId}:`, error.message);
      if (this.textChannel) {
        this.textChannel.send(`⚠️ Error playing **${this.currentTrack?.title || 'track'}**. Skipping...`).catch(() => {});
      }
      this.skipRepeat = true;
      // The voice player emits Idle after a resource error.
    });
  }

  getElapsedSeconds() {
    if (!this.playbackStartTime) return 0;
    const now = this.isPaused && this.pausedAt ? this.pausedAt : Date.now();
    const elapsedMs = now - this.playbackStartTime - this.totalPausedDuration;
    return Math.max(0, Math.floor(elapsedMs / 1000));
  }

  checkAloneStatus() {
    if (!this.voiceChannel || this.destroyed) return;
    const humans = this.voiceChannel.members.filter(m => !m.user.bot);

    if (humans.size === 0) {
      if (!this.aloneTimer) {
        this.aloneTimer = setTimeout(() => {
          this.handleAloneTimeout();
        }, config.aloneTimeoutMs);
      }
    } else {
      if (this.aloneTimer) {
        clearTimeout(this.aloneTimer);
        this.aloneTimer = null;
      }
      if (this.pausedDueToAlone) {
        this.pausedDueToAlone = false;
        this.resume();
        if (this.textChannel) {
          this.textChannel.send('▶️ Someone joined — resuming music!').catch(() => {});
        }
      }
    }
  }

  handleAloneTimeout() {
    const settings = guildSettings.get(this.guildId);
    if (settings.stay247) {
      this.pausedDueToAlone = !this.isPaused && this.pause();
    } else {
      this.destroy();
    }
  }

  async handleTrackEnd(resource) {
    if (this.destroyed) return;
    const finished = this.currentTrack;
    const playbackDuration = resource?.playbackDuration || 0;
    const repeat = !this.skipRepeat && playbackDuration > 0;
    this.skipRepeat = false;
    this.currentTrack = null;
    this.currentResource = null;
    this.isPaused = false;
    this.playbackStartTime = null;
    this.pausedAt = null;
    this.totalPausedDuration = 0;

    if (finished) {
      finished.cleanup();
      this.recentTracks.push(finished.title);
      if (this.recentTracks.length > 20) this.recentTracks.shift();
      if (repeat && this.loopMode === 'track') return this.play(finished);
      if (repeat && this.loopMode === 'queue') this.tracks.push(finished);
    }

    if (!this.tracks.length && this.autoDj && finished && playbackDuration > 0 && !this.pausedDueToAlone) {
      const request = Symbol();
      this.recommendationRequest = request;
      const next = await Track.getRecommendation(finished.title, finished.uploader, this.recentTracks, finished.requestedBy);
      if (this.destroyed || this.recommendationRequest !== request) return;
      this.recommendationRequest = null;
      if (next && this.autoDj) return this.enqueue(next);
    }
    this.processQueue();
  }

  enqueue(trackOrTracks) {
    const incoming = Array.isArray(trackOrTracks) ? trackOrTracks : [trackOrTracks];
    const isIdle = this.player.state.status === AudioPlayerStatus.Idle && !this.currentTrack;

    const playlistCapped = incoming.length > config.maxPlaylistImport;
    const limitedBatch = incoming.slice(0, config.maxPlaylistImport);

    const maxAllowed = config.maxQueueSize + (isIdle ? 1 : 0);
    const availableSlots = Math.max(0, maxAllowed - this.tracks.length);

    if (availableSlots === 0) {
      return { addedCount: 0, playlistCapped, queueCapped: true, queueFull: true };
    }

    const toAdd = limitedBatch.slice(0, availableSlots);
    const queueCapped = limitedBatch.length > availableSlots;

    this.recommendationRequest = null;
    this.tracks.push(...toAdd);
    this.resetIdleTimer();
    this.saveState();

    if (isIdle) {
      this.processQueue();
    }

    return { addedCount: toAdd.length, playlistCapped, queueCapped, queueFull: false };
  }

  processQueue() {
    if (this.destroyed || this.currentTrack) return;
    if (this.tracks.length === 0) {
      this.startIdleTimer();
      this.saveState();
      return;
    }

    this.resetIdleTimer();
    const nextTrack = this.tracks.shift();
    this.saveState();
    this.play(nextTrack);
  }

  async play(track) {
    this.currentTrack = track;
    this.isPaused = false;
    this.playbackStartTime = Date.now();
    this.pausedAt = null;
    this.totalPausedDuration = 0;

    try {
      const targetBitrate = this.voiceChannel?.bitrate || 96000;
      const resource = track.createAudioResource({
        initialVolume: this.volume,
        filterName: this.activeFilter,
        seekSeconds: 0,
        targetBitrate
      });

      this.currentResource = resource;
      this.player.play(resource);
    } catch (err) {
      console.error('Error starting track playback:', err);
      if (this.textChannel) {
        this.textChannel.send(`❌ Could not play **${track?.title || 'track'}**: ${err.message}`).catch(() => {});
      }
      if (track) track.cleanup();
      this.currentTrack = null;
      this.currentResource = null;
      // Advance to next song so queue does not get stranded
      setImmediate(() => this.processQueue());
    }
  }

  async setFilter(filterName) {
    const selected = AUDIO_FILTERS[filterName] ? filterName : 'off';
    if (this.activeFilter === selected) return selected;

    this.activeFilter = selected;
    guildSettings.set(this.guildId, { activeFilter: selected });

    if (this.currentTrack && this.player.state.status !== AudioPlayerStatus.Idle) {
      const elapsed = this.getElapsedSeconds();
      const targetBitrate = this.voiceChannel?.bitrate || 96000;
      try {
        const resource = this.currentTrack.createAudioResource({
          initialVolume: this.volume,
          filterName: this.activeFilter,
          seekSeconds: this.currentTrack.isLive ? 0 : elapsed,
          targetBitrate
        });

        this.currentResource = resource;
        this.player.play(resource);
        this.playbackStartTime = Date.now() - (elapsed * 1000);
        this.pausedAt = this.isPaused ? Date.now() : null;
        this.totalPausedDuration = 0;
      } catch (err) {
        this.currentTrack.cleanup();
        throw err;
      }
    }

    return this.activeFilter;
  }

  pause() {
    if (this.isPaused || !this.currentTrack) return false;
    const status = this.player.state.status;
    if (status !== AudioPlayerStatus.Buffering && status !== AudioPlayerStatus.AutoPaused && !this.player.pause()) return false;
    this.isPaused = true;
    this.pausedAt = Date.now();
    return true;
  }

  resume() {
    if (!this.isPaused || !this.currentTrack) return false;
    this.isPaused = false;
    this.totalPausedDuration += Date.now() - this.pausedAt;
    this.pausedAt = null;
    this.player.unpause();
    return true;
  }

  stop(forceLeave = false) {
    this.recommendationRequest = null;
    this.tracks = [];
    this.currentTrack?.cleanup();
    this.currentTrack = null;
    this.currentResource = null;
    this.pausedDueToAlone = false;
    this.player.stop(true);
    this.saveState();

    if (guildSettings.get(this.guildId).stay247 && !forceLeave) return;
    this.destroy();
  }

  skip() {
    if (this.player.state.status === AudioPlayerStatus.Idle) return false;
    this.skipRepeat = true;
    return this.player.stop(true);
  }

  setVolume(volume) {
    this.volume = Math.max(1, Math.min(100, volume));
    if (this.currentResource && this.currentResource.volume) {
      this.currentResource.volume.setVolume(this.volume / 100);
    }
    guildSettings.set(this.guildId, { volume: this.volume });
  }

  toggleLoop(mode) {
    if (mode && ['off', 'track', 'queue'].includes(mode)) {
      this.loopMode = mode;
    } else {
      const modes = ['off', 'track', 'queue'];
      const nextIdx = (modes.indexOf(this.loopMode) + 1) % modes.length;
      this.loopMode = modes[nextIdx];
    }
    guildSettings.set(this.guildId, { loopMode: this.loopMode });
    return this.loopMode;
  }

  toggleAutoDj(enabled) {
    this.autoDj = typeof enabled === 'boolean' ? enabled : !this.autoDj;
    guildSettings.set(this.guildId, { autoDj: this.autoDj });
    return this.autoDj;
  }

  startIdleTimer() {
    this.resetIdleTimer();
    const settings = guildSettings.get(this.guildId);
    if (settings.stay247) return;

    this.idleTimer = setTimeout(() => {
      this.destroy();
    }, config.idleTimeoutMs);
  }

  resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  saveState() {
    const savedQueue = this.tracks.map(t => ({
      title: t.title,
      url: t.url,
      displayUrl: t.displayUrl,
      duration: t.duration,
      durationFormatted: t.durationFormatted,
      thumbnail: t.thumbnail,
      uploader: t.uploader,
      requestedBy: t.requestedBy,
      isLive: t.isLive
    }));

    guildSettings.set(this.guildId, {
      voiceChannelId: this.voiceChannel?.id || null,
      textChannelId: this.textChannel?.id || null,
      volume: this.volume,
      loopMode: this.loopMode,
      activeFilter: this.activeFilter,
      autoDj: this.autoDj,
      savedQueue,
      lastPlaybackPosition: this.getElapsedSeconds()
    });
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;

    this.resetIdleTimer();
    if (this.aloneTimer) { clearTimeout(this.aloneTimer); this.aloneTimer = null; }
    clearTimeout(this.disconnectTimer);

    if (this.currentTrack) {
      this.currentTrack.cleanup();
      this.currentTrack = null;
    }

    this.tracks = [];

    try { this.player.stop(true); } catch (_) {}
    try { this.connection.destroy(); } catch (_) {}

    this.manager.delete(this.guildId);
  }
}

class MusicManager {
  constructor() {
    this.queues = new Map();
  }

  get(guildId) {
    return this.queues.get(guildId) || null;
  }

  getOrCreate({ guildId, voiceChannel, textChannel }) {
    const settings = guildSettings.get(guildId);
    if (settings.stay247 && settings.voiceChannelId && voiceChannel.id !== settings.voiceChannelId) {
      throw new Error(`24/7 mode is set to <#${settings.voiceChannelId}>.`);
    }
    let queue = this.queues.get(guildId);
    if (!queue || queue.destroyed) {
      queue = new GuildQueue({ manager: this, guildId, voiceChannel, textChannel });
      this.queues.set(guildId, queue);
    } else {
      if (voiceChannel && queue.voiceChannel?.id !== voiceChannel.id) {
        throw new Error(`Ash is already in <#${queue.voiceChannel.id}>. Join that channel to play music.`);
      }
      if (textChannel) queue.textChannel = textChannel;
    }
    return queue;
  }

  delete(guildId) {
    this.queues.delete(guildId);
  }
}

module.exports = new MusicManager();
