const fs = require('fs');
const path = require('path');
const config = require('../config');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'guild-settings.json');

class GuildSettings {
  constructor() {
    this.cache = {};
    this.loaded = this.load();
  }

  getDefaults() {
    return {
      stay247: false,
      voiceChannelId: null,
      textChannelId: null,
      volume: config.defaultVolume || 80,
      loopMode: 'off',
      activeFilter: 'off',
      autoDj: false,
      savedQueue: [],
      lastPlaybackPosition: 0
    };
  }

  load() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(SETTINGS_FILE)) {
        const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
        this.cache = JSON.parse(raw) || {};
      }
    } catch (err) {
      console.error('[GuildSettings] Failed to load local settings:', err.message);
      this.cache = {};
    }

    // Attempt cloud database sync if configured (PostgreSQL / Supabase / Neon / Turso REST)
    if (config.databaseUrl) {
      return this.syncFromCloud().catch(err => {
        console.warn('[GuildSettings] Cloud DB initial sync failed (falling back to local cache):', err.message);
      });
    }
  }

  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      // Atomic write to prevent file corruption
      const tempFile = `${SETTINGS_FILE}.tmp`;
      fs.writeFileSync(tempFile, JSON.stringify(this.cache, null, 2), 'utf-8');
      fs.renameSync(tempFile, SETTINGS_FILE);
    } catch (err) {
      console.error('[GuildSettings] Failed to save settings to disk:', err.message);
    }

    if (config.databaseUrl) {
      this.syncToCloud().catch(err => {
        console.warn('[GuildSettings] Cloud DB save failed:', err.message);
      });
    }
  }

  get(guildId) {
    if (!this.cache[guildId]) {
      this.cache[guildId] = this.getDefaults();
    }
    return this.cache[guildId];
  }

  set(guildId, updates) {
    const current = this.get(guildId);
    this.cache[guildId] = { ...current, ...updates };
    this.save();
    return this.cache[guildId];
  }

  /**
   * Optional Cloud DB Sync (Supports Supabase / Turso / Neon REST endpoints without external dependencies)
   */
  async syncFromCloud() {
    if (!config.databaseUrl) return;
    try {
      // If DATABASE_URL is an HTTP/HTTPS endpoint (e.g. Supabase REST, Turso HTTP, KV)
      if (config.databaseUrl.startsWith('http://') || config.databaseUrl.startsWith('https://')) {
        const res = await fetch(config.databaseUrl, {
          headers: { 'Accept': 'application/json' },
          signal: AbortSignal.timeout(5000)
        });
        if (res.ok) {
          const cloudData = await res.json();
          if (cloudData && typeof cloudData === 'object') {
            this.cache = { ...this.cache, ...cloudData };
            console.log('[GuildSettings] Successfully synced state from Cloud DB.');
          }
        }
      }
    } catch (err) {
      console.warn('[GuildSettings] Cloud sync error:', err.message);
    }
  }

  async syncToCloud() {
    if (!config.databaseUrl) return;
    try {
      if (config.databaseUrl.startsWith('http://') || config.databaseUrl.startsWith('https://')) {
        await fetch(config.databaseUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(this.cache),
          signal: AbortSignal.timeout(5000)
        });
      }
    } catch (err) {
      console.warn('[GuildSettings] Cloud push error:', err.message);
    }
  }
}

module.exports = new GuildSettings();
