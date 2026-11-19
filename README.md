# ⚡ Ash Music - Discord Music Bot

A rock-solid, private Discord music bot with **persistent 24/7 Voice Channel presence**, Spotify conversion, mid-song audio DSP filters with anti-clipping protection, and live karaoke lyrics.

---

## 🎵 Commands List

All commands work seamlessly as Discord **Slash Commands (`/`)** and as classic **Prefix Commands (`!`)** in any channel.

| Slash Command | Prefix Alias | Description |
|---|---|---|
| `/play <query>` | `!play`, `!p` | Play a song title, YouTube URL, or Spotify track / album / playlist link |
| `/pause` | `!pause` | Pause current playback |
| `/resume` | `!resume`, `!unpause` | Resume paused playback |
| `/skip` | `!skip`, `!s` | Skip to the next track in the queue (protected against double-clicks) |
| `/stop` | `!stop` | Stop playback and clear the queue (stays in voice if 24/7 is enabled) |
| `/leave` | `!leave`, `!dc` | Forcefully disconnect from the voice channel and turn off 24/7 mode |
| `/queue` | `!queue`, `!q` | View currently playing song and upcoming queue |
| `/nowplaying` | `!nowplaying`, `!np` | Show track details, live progress bar, and interactive buttons |
| `/volume <1-100>` | `!volume`, `!vol` | Adjust playback volume with zero digital clipping |
| `/loop [mode]` | `!loop`, `!repeat` | Set loop mode (`off`, `track`, `queue`) |
| `/filter <name>` | `!filter`, `!fx` | Apply audio DSP filters mid-song without restarting playback |
| `/lyrics` | `!lyrics`, `!ly` | Display synchronized karaoke lyrics via LRCLIB (5s timeout & cache) |
| `/247 [enabled]` | `!247`, `!stay` | Keep the bot permanently in the voice channel with auto-reconnect |
| `/autodj [enabled]` | `!autodj`, `!dj` | Automatically queue related songs when the queue finishes |
| `/help` | `!help`, `!h` | Display command guide and directory |

---

## ✨ Features & Architecture

* **24/7 voice presence.** Ash checks the selected channel every five seconds. After a handshake grace period it retries with increasing delays, capped at one minute, while 24/7 mode is enabled.
* **🛡️ Smart Idle & Alone-in-Channel Saver:** If everyone leaves the voice channel for 5 minutes in 24/7 mode, streaming processes (`yt-dlp`, `ffmpeg`) are suspended to save host CPU and RAM, and resume instantly as soon as a user rejoins.
* **🎧 Honest Audio Quality:** Native Opus stream passthrough via `yt-dlp` preserving source fidelity. Features dynamic voice channel bitrate matching and an `alimiter` to prevent digital clipping on Bass Boost or high volumes.
* **🎛️ Mid-Track DSP Filters:** Switching filters (Bass Boost, Nightcore, 8D Spatial, Lo-Fi, Vaporwave) smoothly restarts playback from the exact elapsed second rather than jumping back to 0.
* **🎤 Synced Karaoke Lyrics:** Fetches timestamped LRC lyrics from LRCLIB with in-memory caching and speed-factor synchronization.
* **🔒 Strict Security:** Protected against shell injection (argument arrays only), `@everyone` pings (`allowedMentions: { parse: [] }`), and token leakage (secrets redacted from error logs).

---

## 🚀 How to Start the Bot Locally

```powershell
# 1. Register slash commands
npm run deploy

# 2. Start the bot
npm start
```

---

## 🌐 24/7 voice on Render

1. Deploy the Dockerfile on an always-on Render instance. A Free web service can sleep after 15 minutes without inbound traffic. While the process is stopped, Ash cannot maintain a voice connection. [Render Free service limits](https://render.com/docs/free)
2. For one fixed channel, set `GUILD_ID` to the Discord server ID and `VOICE_CHANNEL_ID` to the voice channel ID in the Render environment. On a fresh filesystem Ash uses these as its initial 24/7 target.
3. You can also join the target channel and run `/247 enabled:True`. Ash confirms the channel in its reply. To remember slash-command selections and explicit opt-outs across restarts for either server, mount a writable persistent disk at `/usr/src/app/data`. Saved guild settings take precedence over the environment default. [Render persistent disks](https://render.com/docs/disks)
4. `/stop` clears playback and keeps Ash in voice. `/leave` disconnects and disables 24/7. Use `/247 enabled:False` to disable automatic recovery. After an outage or deploy, Ash rejoins as soon as the service and Discord voice are available.

---

## 📋 Manual Verification Checklist

1. `/play starboy` — verify audio playback starts.
2. `/filter bassboost` mid-song — verify playback resumes from the exact same second without starting over.
3. Rapidly double-click **Skip** — verify only 1 track skips (lock prevents skipping two tracks).
4. Restart/redeploy container — verify bot rejoins the 24/7 channel and restores state.
5. Disconnect the bot manually — verify bot auto-reconnects using backoff.
6. Leave the voice channel empty — verify bot pauses playback after 5 minutes and resumes when you rejoin.
7. `/stop` vs `/leave` — verify `/stop` clears queue and stays in voice, while `/leave` disconnects completely.
