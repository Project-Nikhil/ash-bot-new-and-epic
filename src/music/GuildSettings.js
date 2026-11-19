const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'guild-settings.json');

class GuildSettings {
  constructor() {
    this.cache = {};
    this.load();
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
      console.error('[GuildSettings] Failed to load settings:', err.message);
      this.cache = {};
    }
  }

  save() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(SETTINGS_FILE, JSON.stringify(this.cache, null, 2), 'utf-8');
    } catch (err) {
      console.error('[GuildSettings] Failed to save settings:', err.message);
    }
  }

  get(guildId) {
    if (!this.cache[guildId]) {
      this.cache[guildId] = {
        setupChannelId: null,
        setupMessageId: null,
        stay247: false
      };
    }
    return this.cache[guildId];
  }

  set(guildId, updates) {
    const current = this.get(guildId);
    this.cache[guildId] = { ...current, ...updates };
    this.save();
    return this.cache[guildId];
  }
}

module.exports = new GuildSettings();
