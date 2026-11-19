const {
  joinVoiceChannel,
  createAudioPlayer,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState
} = require('@discordjs/voice');
const config = require('../config');
const guildSettings = require('./GuildSettings');
const {
  createNowPlayingEmbed,
  createControlComponents,
  createDashboardEmbed,
  createIdleDashboardEmbed
} = require('./ui');
const { Track } = require('./Track');
const { AUDIO_FILTERS } = require('./filters');

const RECONNECT_BACKOFFS = [2000, 5000, 10000, 30000, 60000];

class GuildQueue {
  constructor({ manager, guildId, voiceChannel, textChannel }) {
    this.manager = manager;
    this.guildId = guildId;
    this.voiceChannel = voiceChannel;
    this.textChannel = textChannel;

    this.tracks = [];
    this.currentTrack = null;
    this.volume = config.defaultVolume;
    this.loopMode = 'off'; // 'off' | 'track' | 'queue'
    this.isPaused = false;
    this.destroyed = false;
    this.consecutiveQuickFails = 0;
    this.idleTimer = null;
    this.aloneTimer = null;
    this.pausedDueToAlone = false;
    this.currentResource = null;
    this.nowPlayingMessage = null;
    this.actionLock = false;

    // Filter, Auto-DJ & History
    this.activeFilter = 'off';
    this.autoDj = false;
    this.recentTracks = []; // Stores last 20 titles to prevent repetition
    this.playbackStartTime = null;
    this.pausedAt = null;
    this.totalPausedDuration = 0;

    // Reconnection state
    this.reconnectAttempts = 0;
    this.reconnectTimeout = null;

    // Load persisted settings
    const saved = guildSettings.get(guildId);
    if (saved) {
      if (typeof saved.volume === 'number') this.volume = saved.volume;
      if (saved.loopMode) this.loopMode = saved.loopMode;
      if (saved.activeFilter) this.activeFilter = saved.activeFilter;
      if (typeof saved.autoDj === 'boolean') this.autoDj = saved.autoDj;
    }

    // Create AudioPlayer
    this.player = createAudioPlayer();
    this.setupPlayerListeners();

    // Establish Voice Connection
    this.initVoiceConnection();
  }

  initVoiceConnection() {
    if (!this.voiceChannel) return;

    this.connection = joinVoiceChannel({
      channelId: this.voiceChannel.id,
      guildId: this.guildId,
      adapterCreator: this.voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true
    });

    this.connection.subscribe(this.player);
    this.setupConnectionListeners();

    // Persist current channels
    guildSettings.set(this.guildId, {
      voiceChannelId: this.voiceChannel.id,
      textChannelId: this.textChannel?.id || null
    });
  }

  setupConnectionListeners() {
    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5000)
        ]);
        // Successfully reconnected
        this.reconnectAttempts = 0;
      } catch (error) {
        this.handleVoiceDisconnect();
      }
    });

    this.connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (!this.destroyed) {
        this.handleVoiceDisconnect();
      }
    });
  }

  /**
   * Exponential backoff auto-reconnect for 24/7 reliability
   */
  async handleVoiceDisconnect() {
    if (this.destroyed) return;

    const settings = guildSettings.get(this.guildId);
    if (!settings.stay247) {
      this.destroy();
      return;
    }

    if (this.reconnectAttempts >= RECONNECT_BACKOFFS.length) {
      console.warn(`[VoiceConnection] Guild ${this.guildId}: Max reconnect attempts reached.`);
      if (this.textChannel) {
        this.textChannel.send('⚠️ Could not reconnect to voice channel after multiple attempts. 24/7 paused until manually rejoined.').catch(() => {});
      }
      this.destroy();
      return;
    }

    const delay = RECONNECT_BACKOFFS[this.reconnectAttempts] || 60000;
    this.reconnectAttempts += 1;
    console.log(`[VoiceConnection] Guild ${this.guildId}: Reconnecting in ${delay / 1000}s (Attempt ${this.reconnectAttempts})...`);

    if (this.reconnectTimeout) clearTimeout(this.reconnectTimeout);
    this.reconnectTimeout = setTimeout(async () => {
      if (this.destroyed) return;
      try {
        const client = this.voiceChannel?.client || this.textChannel?.client;
        if (!client) return;

        // Verify channel still exists
        const channelId = settings.voiceChannelId || this.voiceChannel?.id;
        const channel = await client.channels.fetch(channelId).catch(() => null);

        if (!channel) {
          console.warn(`[VoiceConnection] Guild ${this.guildId}: Saved voice channel no longer exists.`);
          guildSettings.set(this.guildId, { stay247: false, voiceChannelId: null });
          if (this.textChannel) {
            this.textChannel.send('⚠️ The 24/7 voice channel was deleted. 24/7 mode has been disabled.').catch(() => {});
          }
          this.destroy();
          return;
        }

        this.voiceChannel = channel;
        this.initVoiceConnection();
        this.reconnectAttempts = 0;
        console.log(`[VoiceConnection] Guild ${this.guildId}: Successfully reconnected!`);
      } catch (err) {
        console.error(`[VoiceConnection] Reconnect error for guild ${this.guildId}:`, err.message);
        this.handleVoiceDisconnect();
      }
    }, delay);
  }

  setupPlayerListeners() {
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.handleTrackEnd();
    });

    this.player.on('error', (error) => {
      console.error(`[AudioPlayer Error] in guild ${this.guildId}:`, error.message);
      if (this.textChannel) {
        this.textChannel.send(`⚠️ Error playing track: ${error.message}. Skipping to next...`).catch(() => {});
      }
      this.handleTrackEnd();
    });
  }

  /**
   * Action lock / mutex wrapper to prevent double-skips and state corruption
   * @param {Function} fn
   */
  async withLock(fn) {
    if (this.actionLock) return false;
    this.actionLock = true;
    try {
      return await fn();
    } finally {
      this.actionLock = false;
    }
  }

  getElapsedSeconds() {
    if (!this.playbackStartTime) return 0;
    const now = this.isPaused && this.pausedAt ? this.pausedAt : Date.now();
    const elapsedMs = now - this.playbackStartTime - this.totalPausedDuration;
    return Math.max(0, Math.floor(elapsedMs / 1000));
  }

  async updateDashboard() {
    const client = this.voiceChannel?.client || this.textChannel?.client;
    if (!client) return;
    await this.manager.refreshDashboard(client, this.guildId, this);
  }

  /**
   * Inspects voice channel to see if bot is alone
   * Pauses after 5 mins if 24/7, leaves if non-24/7, auto-resumes when user joins
   */
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
          this.textChannel.send('👋 Someone joined the voice channel! Resuming music.').catch(() => {});
        }
      }
    }
  }

  handleAloneTimeout() {
    const settings = guildSettings.get(this.guildId);
    if (settings.stay247) {
      this.pausedDueToAlone = true;
      this.pause();
      if (this.currentTrack) {
        this.currentTrack.cleanup(); // Clean up child processes to free CPU/RAM
      }
      if (this.textChannel) {
        this.textChannel.send('⏸️ Channel empty for 5 minutes. Paused playback to save bandwidth & CPU (staying connected in 24/7 mode).').catch(() => {});
      }
    } else {
      if (this.textChannel) {
        this.textChannel.send('👋 Voice channel was empty for 5 minutes. Left voice channel to save resources.').catch(() => {});
      }
      this.destroy();
    }
  }

  async handleTrackEnd() {
    if (this.destroyed) return;

    await this.withLock(async () => {
      const playDurationMs = this.playbackStartTime ? Date.now() - this.playbackStartTime : 0;
      const finishedTrack = this.currentTrack;

      if (finishedTrack) {
        finishedTrack.cleanup();
        // Record title in recent history (up to 20 tracks)
        if (finishedTrack.title) {
          this.recentTracks.push(finishedTrack.title);
          if (this.recentTracks.length > 20) this.recentTracks.shift();
        }
      }

      // Guard against rapid infinite failure loops
      if (finishedTrack && playDurationMs < 1500) {
        this.consecutiveQuickFails += 1;
      } else {
        this.consecutiveQuickFails = 0;
      }

      this.playbackStartTime = null;
      this.pausedAt = null;
      this.totalPausedDuration = 0;

      if (this.consecutiveQuickFails >= 3) {
        console.warn(`[MusicQueue] Guild ${this.guildId}: 3 consecutive quick failures. Resetting queue.`);
        this.consecutiveQuickFails = 0;
        this.currentTrack = null;
        this.currentResource = null;
        this.loopMode = 'off';
        this.processQueue();
        return;
      }

      // Handle Loop Modes
      if (this.loopMode === 'track' && finishedTrack) {
        this.play(finishedTrack);
        return;
      }

      if (this.loopMode === 'queue' && finishedTrack) {
        this.tracks.push(finishedTrack);
      }

      this.currentTrack = null;
      this.currentResource = null;

      // Auto-DJ: Find next related song when queue is dry
      if (this.tracks.length === 0 && this.autoDj && finishedTrack && !this.pausedDueToAlone) {
        if (this.textChannel) {
          this.textChannel.send('📻 *Auto-DJ is searching for a related track...*').catch(() => {});
        }

        const recommendation = await Track.getRecommendation(
          finishedTrack.title,
          finishedTrack.uploader,
          this.recentTracks,
          finishedTrack.requestedBy
        );

        if (recommendation) {
          this.enqueue(recommendation);
          return;
        }
      }

      this.processQueue();
    });
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

    this.tracks.push(...toAdd);
    this.resetIdleTimer();
    this.saveState();

    if (isIdle) {
      this.processQueue();
    } else {
      this.updateDashboard();
    }

    return {
      addedCount: toAdd.length,
      playlistCapped,
      queueCapped,
      queueFull: false
    };
  }

  processQueue() {
    if (this.tracks.length === 0) {
      this.updateDashboard();
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

      // Disable buttons on previous message to avoid confusion
      if (this.nowPlayingMessage) {
        this.nowPlayingMessage.edit({ components: [] }).catch(() => {});
      }

      // Send fresh Now Playing controller embed
      if (this.textChannel) {
        const embed = createNowPlayingEmbed(track, this);
        const components = createControlComponents(this);

        const msg = await this.textChannel.send({
          embeds: [embed],
          components
        }).catch(() => null);

        this.nowPlayingMessage = msg;
      }
    } catch (err) {
      console.error('Error starting track playback:', err);
      if (this.textChannel) {
        this.textChannel.send(`❌ Could not play **${track.title}**: ${err.message}`).catch(() => {});
      }
      this.handleTrackEnd();
    }
  }

  /**
   * Mid-song filter changes without restarting from 0:
   * Restarts FFmpeg starting at current playback position (seekSeconds)
   * @param {string} filterName
   * @returns {string}
   */
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
          seekSeconds: elapsed,
          targetBitrate
        });

        this.currentResource = resource;
        this.player.play(resource);
        this.playbackStartTime = Date.now() - (elapsed * 1000);
        this.pausedAt = null;
        this.totalPausedDuration = 0;
      } catch (err) {
        console.error('[Filter Change Error]', err);
      }
    }

    this.updateDashboard();
    return this.activeFilter;
  }

  pause() {
    if (this.player.state.status === AudioPlayerStatus.Playing) {
      this.player.pause();
      this.isPaused = true;
      this.pausedAt = Date.now();
      this.updateDashboard();
      return true;
    }
    return false;
  }

  resume() {
    if (this.player.state.status === AudioPlayerStatus.Paused) {
      if (this.pausedAt) {
        this.totalPausedDuration += Date.now() - this.pausedAt;
        this.pausedAt = null;
      }
      this.player.unpause();
      this.isPaused = false;
      this.updateDashboard();
      return true;
    }
    return false;
  }

  stop(forceLeave = false) {
    this.tracks = [];
    if (this.currentTrack) {
      this.currentTrack.cleanup();
      this.currentTrack = null;
    }
    this.player.stop();
    this.saveState();

    const settings = guildSettings.get(this.guildId);
    if (settings.stay247 && !forceLeave) {
      this.updateDashboard();
      return;
    }

    this.destroy();
  }

  skip() {
    if (this.player.state.status !== AudioPlayerStatus.Idle) {
      this.player.stop();
      return true;
    }
    return false;
  }

  setVolume(volume) {
    this.volume = Math.max(1, Math.min(100, volume));
    if (this.currentResource && this.currentResource.volume) {
      this.currentResource.volume.setVolume(this.volume / 100);
    }
    guildSettings.set(this.guildId, { volume: this.volume });
    this.updateDashboard();
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
    this.updateDashboard();
    return this.loopMode;
  }

  toggleAutoDj(enabled) {
    this.autoDj = typeof enabled === 'boolean' ? enabled : !this.autoDj;
    guildSettings.set(this.guildId, { autoDj: this.autoDj });
    return this.autoDj;
  }

  startIdleTimer() {
    this.resetIdleTimer();

    // Respect 24/7 Mode — never auto-disconnect when enabled
    const settings = guildSettings.get(this.guildId);
    if (settings.stay247) {
      return;
    }

    this.idleTimer = setTimeout(() => {
      if (this.textChannel) {
        this.textChannel.send('👋 Queue is empty. Left voice channel to save resources.').catch(() => {});
      }
      this.destroy();
    }, config.idleTimeoutMs);
  }

  resetIdleTimer() {
    if (this.idleTimer) {
      clearTimeout(this.idleTimer);
      this.idleTimer = null;
    }
  }

  /**
   * Persists active queue and state for redeploy / restart recovery
   */
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
    if (this.aloneTimer) {
      clearTimeout(this.aloneTimer);
      this.aloneTimer = null;
    }
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    if (this.currentTrack) {
      this.currentTrack.cleanup();
      this.currentTrack = null;
    }

    this.tracks = [];

    if (this.nowPlayingMessage) {
      this.nowPlayingMessage.edit({ components: [] }).catch(() => {});
      this.nowPlayingMessage = null;
    }

    try {
      this.player.stop(true);
    } catch (_) {}

    try {
      this.connection.destroy();
    } catch (_) {}

    this.manager.delete(this.guildId);
    this.updateDashboard();
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
    let queue = this.queues.get(guildId);
    if (!queue || queue.destroyed) {
      queue = new GuildQueue({
        manager: this,
        guildId,
        voiceChannel,
        textChannel
      });
      this.queues.set(guildId, queue);
    } else {
      if (voiceChannel && queue.voiceChannel?.id !== voiceChannel.id) {
        queue.voiceChannel = voiceChannel;
      }
      if (textChannel) {
        queue.textChannel = textChannel;
      }
    }
    return queue;
  }

  delete(guildId) {
    this.queues.delete(guildId);
  }

  async refreshDashboard(client, guildId, queue = null) {
    const settings = guildSettings.get(guildId);
    if (!settings.setupChannelId || !settings.setupMessageId) return;

    try {
      const channel = await client.channels.fetch(settings.setupChannelId).catch(() => null);
      if (!channel) return;

      const message = await channel.messages.fetch(settings.setupMessageId).catch(() => null);
      if (!message) return;

      const hasTrack = queue && queue.currentTrack;
      const embed = hasTrack
        ? createDashboardEmbed(queue)
        : createIdleDashboardEmbed(guildId);

      const components = createControlComponents(queue, guildId);

      await message.edit({
        embeds: [embed],
        components
      }).catch(() => {});
    } catch (err) {
      console.warn(`[Dashboard Refresh] Failed in guild ${guildId}:`, err.message);
    }
  }
}

module.exports = new MusicManager();
