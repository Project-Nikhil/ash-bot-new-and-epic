const { VoiceConnectionStatus } = require('@discordjs/voice');
const guildSettings = require('./GuildSettings');
const musicManager = require('./MusicManager');
const { Track } = require('./Track');

const CHECK_INTERVAL = 5000;
const RETRY_DELAYS = [15000, 30000, 60000];

// One recovery attempt per guild, including when no queue exists yet after a restart.
class VoicePresence {
  constructor(client) {
    this.client = client;
    this.retries = new Map();
  }

  check() {
    if (!this.client.isReady()) return;
    for (const [guildId, settings] of Object.entries(guildSettings.cache)) {
      if (!settings.stay247 || !settings.voiceChannelId) {
        this.retries.delete(guildId);
        continue;
      }

      const target = settings.voiceChannelId;
      const queue = musicManager.get(guildId);
      const guild = this.client.guilds.cache.get(guildId);
      if (!guild?.available) continue;
      if (queue?.connection?.state.status === VoiceConnectionStatus.Ready &&
          guild.members.me?.voice.channelId === target) {
        this.retries.delete(guildId);
        continue;
      }

      let retry = this.retries.get(guildId);
      if (retry?.target !== target) {
        // Give a live queue's native voice handshake time to recover by itself.
        retry = { target, attempts: 0, busy: false, due: queue ? Date.now() + RETRY_DELAYS[0] : 0 };
        this.retries.set(guildId, retry);
      }
      if (retry.busy || Date.now() < retry.due) continue;

      retry.busy = true;
      this.recover(guildId, retry, queue).catch(error => {
        console.warn(`[24/7] Guild ${guildId}, channel ${target}: ${error.message}`);
      }).finally(() => {
        const delay = RETRY_DELAYS[Math.min(retry.attempts, RETRY_DELAYS.length - 1)];
        retry.due = Date.now() + delay;
        retry.attempts++;
        retry.busy = false;
      });
    }
  }

  async recover(guildId, retry, queue) {
    if (queue) {
      // A repeated join can reuse a stuck networking instance. Replace its adapter
      // without sending a voice-channel leave to Discord.
      if (retry.attempts >= 2 && queue.connection.state.status !== VoiceConnectionStatus.Ready &&
          queue.connection.state.status !== VoiceConnectionStatus.Destroyed) {
        queue.connection.destroy(false);
      }
      queue.connect();
      return;
    }
    const settings = guildSettings.get(guildId);
    const [voiceChannel, textChannel] = await Promise.all([
      this.client.channels.fetch(retry.target),
      settings.textChannelId ? this.client.channels.fetch(settings.textChannelId).catch(() => null) : null
    ]);
    const current = guildSettings.get(guildId);
    if (!this.client.isReady() || this.retries.get(guildId) !== retry ||
        !current.stay247 || current.voiceChannelId !== retry.target || musicManager.get(guildId)) return;
    if (!voiceChannel?.isVoiceBased() || voiceChannel.guildId !== guildId) {
      throw new Error('Configured voice channel is unavailable');
    }
    const restored = musicManager.getOrCreate({ guildId, voiceChannel, textChannel });
    if (current.savedQueue?.length) restored.enqueue(current.savedQueue.map(item => new Track(item)));
  }

  start() {
    this.check();
    this.timer = setInterval(() => this.check(), CHECK_INTERVAL);
    this.timer.unref();
  }
}

module.exports = VoicePresence;
