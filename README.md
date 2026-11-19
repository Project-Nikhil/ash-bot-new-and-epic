# ⚡ Ash Music - Discord Music Bot

A modern, high-performance Discord music bot with **24/7 Voice Channel mode**, Spotify playlist support, interactive controls, and real-time DSP audio filters.

---

## 🎵 Commands List

All commands work seamlessly as Discord **Slash Commands (`/`)** and as classic **Prefix Commands (`!`)** in any channel.

| Slash Command | Prefix Alias | Description |
|---|---|---|
| `/play <query>` | `!play`, `!p` | Play a song title, YouTube URL, or Spotify track / album / playlist link |
| `/pause` | `!pause` | Pause current playback |
| `/resume` | `!resume`, `!unpause` | Resume paused playback |
| `/skip` | `!skip`, `!s`, `!next` | Skip to the next track in the queue |
| `/stop` | `!stop`, `!leave`, `!dc` | Stop playing, clear the queue, and leave (or stay if 24/7 is on) |
| `/queue` | `!queue`, `!q` | View currently playing song and upcoming queue |
| `/nowplaying` | `!nowplaying`, `!np` | Show track details, live progress bar, and interactive buttons |
| `/volume <1-100>` | `!volume`, `!vol` | Adjust playback volume |
| `/loop [mode]` | `!loop`, `!repeat` | Set loop mode (`off`, `track`, `queue`) |
| `/filter <name>` | `!filter`, `!fx` | Apply audio DSP filters (Bass Boost, Nightcore, 8D, Lo-Fi, etc.) |
| `/lyrics` | `!lyrics`, `!ly` | Display synchronized karaoke lyrics via LRCLIB |
| `/247 [enabled]` | `!247`, `!stay` | Keep the bot permanently in the voice channel |

---

## ✨ Features

* **Universal `/play`:** Search by song name (e.g., `/play starboy`), paste direct YouTube links, or paste **Spotify tracks, albums, and playlists**.
* **📻 24/7 Voice Mode:** Use `/247 true` to keep the bot connected to your voice channel around the clock without timing out.
* **🎮 Interactive Now Playing Controller:** Every track sends a sleek embed with live buttons (`Pause/Resume`, `Skip`, `Loop`, `Stop`, `Queue`, `Lyrics`, and `Filter` dropdown) for easy one-click control.
* **🎛️ Real-Time DSP Audio Filters:**
  * **Bass Boost (+10dB Lows)**
  * **Nightcore (1.25x Pitch & Speed)**
  * **8D Spatial Audio (360° Surround Panning)**
  * **Lo-Fi Chill (Warm Analog Filter)**
  * **Vaporwave (Slowed + Deep Reverb)**
* **🎤 Live Synced Lyrics:** Real-time karaoke-highlighted lyrics powered by LRCLIB with zero API keys required.

---

## 🚀 How to Start the Bot Locally

```powershell
# 1. Register slash commands (already done!)
npm run deploy

# 2. Start the bot
npm start
```

---

## 🌐 24/7 Cloud Hosting (Render + UptimeRobot)

This bot includes a built-in HTTP health-check server (`src/index.js`) and a production `Dockerfile` with `yt-dlp` and `ffmpeg` pre-installed.

### Step 1: Push to GitHub
1. Create a repository on [GitHub](https://github.com).
2. Push your project files (your `.env` is automatically protected and ignored by `.gitignore`).

### Step 2: Deploy on Render
1. Go to [Render.com](https://render.com) and sign in with GitHub.
2. Click **New +** > **Web Service**.
3. Select your bot repository.
4. Render will auto-detect the `Dockerfile`.
5. Select the **Free** instance type.
6. Under **Environment Variables**, add:
   * `DISCORD_TOKEN` = Your bot token
   * `CLIENT_ID` = Your bot client ID
   * `SPOTIFY_CLIENT_ID` = (Optional) Spotify Client ID
   * `SPOTIFY_CLIENT_SECRET` = (Optional) Spotify Client Secret
7. Click **Create Web Service**.
8. Copy your Render web service URL (e.g. `https://your-bot-name.onrender.com`).

### Step 3: Keep Alive with UptimeRobot
1. Go to [UptimeRobot.com](https://uptimerobot.com) (free).
2. Click **Add New Monitor**:
   * **Monitor Type**: `HTTP(s)`
   * **Friendly Name**: `Ash Music Bot`
   * **URL**: `https://your-bot-name.onrender.com`
   * **Monitoring Interval**: `5 minutes`
3. Click **Create Monitor**.
*UptimeRobot will ping your bot every 5 minutes, keeping Render awake 24/7!*

