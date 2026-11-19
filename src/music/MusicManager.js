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
    this.currentResource = null;
    this.nowPlayingMessage = null;

    // Modern AI & Audio Features
    this.activeFilter = 'off';
    this.autoDj = false;
    this.playbackStartTime = null;
    this.pausedAt = null;
    this.totalPausedDuration = 0;

    // Create AudioPlayer
    this.player = createAudioPlayer();
    this.setupPlayerListeners();

    // Establish Voice Connection
    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: guildId,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true
    });

    this.connection.subscribe(this.player);
    this.setupConnectionListeners();
  }

  setupConnectionListeners() {
    this.connection.on(VoiceConnectionStatus.Disconnected, async () => {
      try {
        await Promise.race([
          entersState(this.connection, VoiceConnectionStatus.Signalling, 5000),
          entersState(this.connection, VoiceConnectionStatus.Connecting, 5000)
        ]);
      } catch (error) {
        this.destroy();
      }
    });

    this.connection.on(VoiceConnectionStatus.Destroyed, () => {
      this.destroy();
    });
  }

  setupPlayerListeners() {
    this.player.on(AudioPlayerStatus.Idle, () => {
      this.handleTrackEnd();
    });

    this.player.on('error', (error) => {
      console.error(`[AudioPlayer Error] in guild ${this.guildId}:`, error.message);
      const settings = guildSettings.get(this.guildId);
      if (this.textChannel && this.textChannel.id !== settings.setupChannelId) {
        this.textChannel.send(`⚠️ Error playing track: ${error.message}. Skipping to next...`).catch(() => {});
      }
      this.handleTrackEnd();
    });
  }

  getElapsedSeconds() {
    if (!this.playbackStartTime) return 0;
    const now = this.isPaused && this.pausedAt ? this.pausedAt : Date.now();
    const elapsedMs = now - this.playbackStartTime - this.totalPausedDuration;
    return Math.max(0, Math.floor(elapsedMs / 1000));
  }

  /**
   * Updates the Pinned Live Player Dashboard in the Dedicated Music Channel (if configured)
   */
  async updateDashboard() {
    const client = this.voiceChannel?.client || this.textChannel?.client;
    if (!client) return;
    await this.manager.refreshDashboard(client, this.guildId, this);
  }

  async handleTrackEnd() {
    if (this.destroyed) return;

    const playDurationMs = this.playbackStartTime ? Date.now() - this.playbackStartTime : 0;
    const finishedTrack = this.currentTrack;
    if (finishedTrack) {
      finishedTrack.cleanup();
    }

    // Guard against tight infinite failure loops if stream fails instantly
    if (finishedTrack && playDurationMs < 1500) {
      this.consecutiveQuickFails += 1;
    } else {
      this.consecutiveQuickFails = 0;
    }

    this.playbackStartTime = null;
    this.pausedAt = null;
    this.totalPausedDuration = 0;

    if (this.consecutiveQuickFails >= 3) {
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

    // Handle Auto-DJ when queue runs dry
    if (this.tracks.length === 0 && this.autoDj && finishedTrack) {
      if (this.textChannel) {
        this.textChannel.send('🤖 *AI Auto-DJ is finding the next recommended track...*').catch(() => {});
      }

      const recommendation = await Track.getRecommendation(finishedTrack.title, finishedTrack.requestedBy);
      if (recommendation) {
        this.enqueue(recommendation);
        return;
      }
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

    this.tracks.push(...toAdd);
    this.resetIdleTimer();

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
      return;
    }

    this.resetIdleTimer();
    const nextTrack = this.tracks.shift();
    this.play(nextTrack);
  }

  async play(track) {
    this.currentTrack = track;
    this.isPaused = false;
    this.playbackStartTime = Date.now();
    this.pausedAt = null;
    this.totalPausedDuration = 0;

    try {
      const resource = track.createAudioResource(this.volume, this.activeFilter);
      this.currentResource = resource;
      this.player.play(resource);

      // Disable buttons on previous track's message to keep chat neat
      if (this.nowPlayingMessage) {
        this.nowPlayingMessage.edit({ components: [] }).catch(() => {});
      }

      // Send Now Playing message with interactive controls
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

  setFilter(filterName) {
    if (!AUDIO_FILTERS[filterName]) {
      this.activeFilter = 'off';
    } else {
      this.activeFilter = filterName;
    }

    if (this.currentTrack && this.player.state.status !== AudioPlayerStatus.Idle) {
      try {
        const resource = this.currentTrack.createAudioResource(this.volume, this.activeFilter);
        this.currentResource = resource;
        this.player.play(resource);
      } catch (err) {
        console.error('Error applying audio filter:', err);
      }
    }

    this.updateDashboard();
    return this.activeFilter;
  }

  toggleAutoDj(forcedState) {
    this.autoDj = typeof forcedState === 'boolean' ? forcedState : !this.autoDj;
    this.updateDashboard();
    return this.autoDj;
  }

  skip() {
    this.player.stop();
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

    const settings = guildSettings.get(this.guildId);
    if (settings.stay247 && !forceLeave) {
      this.updateDashboard();
      return;
    }

    this.destroy();
  }

  setVolume(volume) {
    this.volume = Math.max(1, Math.min(100, volume));
    if (this.currentResource && this.currentResource.volume) {
      this.currentResource.volume.setVolume(this.volume / 100);
    }
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
    this.updateDashboard();
    return this.loopMode;
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

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.resetIdleTimer();

    const client = this.voiceChannel?.client || this.textChannel?.client;

    if (this.currentTrack) {
      this.currentTrack.cleanup();
      this.currentTrack = null;
    }

    for (const track of this.tracks) {
      track.cleanup();
    }
    this.tracks = [];

    try {
      this.player.stop();
    } catch (_) {}

    try {
      if (this.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        this.connection.destroy();
      }
    } catch (_) {}

    this.manager.delete(this.guildId);

    if (client) {
      this.manager.refreshDashboard(client, this.guildId, null);
    }
  }
}

class MusicManager {
  constructor() {
    /** @type {Map<string, GuildQueue>} */
    this.queues = new Map();
  }

  getOrCreate({ guildId, voiceChannel, textChannel }) {
    let queue = this.queues.get(guildId);
    if (!queue) {
      queue = new GuildQueue({
        manager: this,
        guildId,
        voiceChannel,
        textChannel
      });
      this.queues.set(guildId, queue);
    } else {
      queue.voiceChannel = voiceChannel;
      queue.textChannel = textChannel;
    }
    return queue;
  }

  get(guildId) {
    return this.queues.get(guildId);
  }

  delete(guildId) {
    this.queues.delete(guildId);
  }

  /**
   * Refreshes the pinned live player controller embed inside the guild's setup channel
   * @param {import('discord.js').Client} client
   * @param {string} guildId
   * @param {GuildQueue|null} [queueOverride]
   */
  async refreshDashboard(client, guildId, queueOverride = undefined) {
    const settings = guildSettings.get(guildId);
    if (!settings.setupChannelId || !settings.setupMessageId) return;

    try {
      const channel = await client.channels.fetch(settings.setupChannelId).catch(() => null);
      if (!channel || !channel.isTextBased()) return;

      const msg = await channel.messages.fetch(settings.setupMessageId).catch(() => null);
      if (!msg) return;

      const queue = queueOverride !== undefined ? queueOverride : this.queues.get(guildId);
      const embed = queue && queue.currentTrack
        ? createDashboardEmbed(queue)
        : createIdleDashboardEmbed(guildId);

      const components = createControlComponents(queue || null, guildId);

      await msg.edit({
        content: null,
        embeds: [embed],
        components
      }).catch(() => {});
    } catch (_) {}
  }
}

module.exports = new MusicManager();
