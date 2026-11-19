const { Events } = require('discord.js');
const musicManager = require('../music/MusicManager');
const guildSettings = require('../music/GuildSettings');
const {
  createControlComponents,
  createQueueEmbed,
  createNowPlayingEmbed,
  createDashboardEmbed,
  createIdleDashboardEmbed
} = require('../music/ui');
const { AUDIO_FILTERS } = require('../music/filters');

function buildUpdatedPayload(interaction, queue) {
  const settings = guildSettings.get(interaction.guildId);
  const isDashboard = settings.setupMessageId && interaction.message.id === settings.setupMessageId;

  let embed;
  if (isDashboard) {
    embed = queue && queue.currentTrack
      ? createDashboardEmbed(queue)
      : createIdleDashboardEmbed(interaction.guildId);
  } else if (queue && queue.currentTrack) {
    embed = createNowPlayingEmbed(queue.currentTrack, queue);
  }

  return {
    embeds: embed ? [embed] : undefined,
    components: createControlComponents(queue, interaction.guildId)
  };
}

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // 1. Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) {
        console.warn(`[WARN] Unknown command executed: ${interaction.commandName}`);
        return;
      }

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[ERROR] Error executing command ${interaction.commandName}:`, error);
        const replyPayload = {
          content: '❌ There was an error while executing this command!',
          ephemeral: true
        };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(replyPayload).catch(() => {});
        } else {
          await interaction.reply(replyPayload).catch(() => {});
        }
      }
      return;
    }

    // 2. Handle String Select Menu (Audio Filter Selector)
    if (interaction.isStringSelectMenu()) {
      const customId = interaction.customId;

      if (customId === 'music_filter_select') {
        const queue = musicManager.get(interaction.guildId);
        if (!queue) {
          return interaction.reply({ content: '❌ No active music session in this server!', ephemeral: true });
        }

        await interaction.deferUpdate();
        const selectedFilter = interaction.values[0];
        const newFilter = queue.setFilter(selectedFilter);
        const filterInfo = AUDIO_FILTERS[newFilter] || AUDIO_FILTERS.off;

        await interaction.editReply(buildUpdatedPayload(interaction, queue)).catch((e) => console.error('[UI Update Error]', e));
        await interaction.followUp({
          content: `🎛️ **Audio DSP Filter updated:** \`${filterInfo.emoji} ${filterInfo.name}\``,
          ephemeral: true
        }).catch(() => {});
        return;
      }
    }

    // 3. Handle Button Interactions
    if (interaction.isButton()) {
      const customId = interaction.customId;
      if (!customId.startsWith('music_')) return;

      const settings = guildSettings.get(interaction.guildId);
      const isSetupChannel = settings.setupChannelId && interaction.channelId === settings.setupChannelId;

      // 24/7 toggle can work even when no queue is active
      if (customId === 'music_247_toggle') {
        await interaction.deferUpdate();

        const nextState = !settings.stay247;
        guildSettings.set(interaction.guildId, { stay247: nextState });

        let queue = musicManager.get(interaction.guildId);
        const memberVoice = interaction.member?.voice?.channel;

        if (nextState) {
          if (queue) {
            queue.resetIdleTimer();
          } else if (memberVoice) {
            queue = musicManager.getOrCreate({
              guildId: interaction.guildId,
              voiceChannel: memberVoice,
              textChannel: interaction.channel
            });
          }
        } else if (queue && !queue.currentTrack && queue.tracks.length === 0) {
          queue.startIdleTimer();
        }

        await interaction.editReply(buildUpdatedPayload(interaction, queue)).catch((e) => console.error('[24/7 UI Update Error]', e));
        await interaction.followUp({
          content: `📻 **24/7 VC Mode:** \`${nextState ? '🟢 ENABLED' : '⚪ DISABLED'}\``,
          ephemeral: true
        }).catch(() => {});
        return;
      }

      // Live Synchronized Lyrics Viewer (Ephemeral)
      if (customId === 'music_lyrics') {
        const queue = musicManager.get(interaction.guildId);
        if (!queue || !queue.currentTrack) {
          return interaction.reply({ content: '❌ No music is currently playing!', ephemeral: true });
        }

        await interaction.deferReply({ ephemeral: true });
        const { buildLyricsPayload } = require('../music/lyrics');
        const payload = await buildLyricsPayload(queue.currentTrack, queue, 'live');
        return interaction.editReply({ embeds: [payload.embed], components: payload.components });
      }

      // Refresh line or Toggle Live/Full Lyrics mode
      if (customId === 'music_lyrics_refresh' || customId.startsWith('music_lyrics_toggle:')) {
        const queue = musicManager.get(interaction.guildId);
        if (!queue || !queue.currentTrack) {
          return interaction.followUp({ content: '❌ That song has finished playing.', ephemeral: true }).catch(() => {});
        }

        await interaction.deferUpdate();
        const mode = customId.startsWith('music_lyrics_toggle:') ? customId.split(':')[1] : 'live';
        const { buildLyricsPayload } = require('../music/lyrics');
        const payload = await buildLyricsPayload(queue.currentTrack, queue, mode);
        return interaction.editReply({ embeds: [payload.embed], components: payload.components });
      }

      const memberVoice = interaction.member?.voice?.channel;
      if (!memberVoice) {
        return interaction.reply({
          content: '❌ You must be in a voice channel to use music controls!',
          ephemeral: true
        });
      }

      const queue = musicManager.get(interaction.guildId);
      if (!queue) {
        return interaction.reply({
          content: '❌ No active music session in this server!',
          ephemeral: true
        });
      }

      switch (customId) {
        case 'music_toggle_pause': {
          await interaction.deferUpdate();
          if (queue.isPaused) {
            queue.resume();
          } else {
            queue.pause();
          }
          await interaction.editReply(buildUpdatedPayload(interaction, queue)).catch((e) => console.error('[Pause UI Update Error]', e));
          break;
        }

        case 'music_skip': {
          const title = queue.currentTrack?.title || 'current song';
          await interaction.reply({
            content: `⏭️ <@${interaction.user.id}> skipped **${title}**.`,
            ephemeral: isSetupChannel
          });
          queue.skip();
          break;
        }

        case 'music_loop': {
          await interaction.deferUpdate();
          const newMode = queue.toggleLoop();
          await interaction.editReply(buildUpdatedPayload(interaction, queue)).catch((e) => console.error('[Loop UI Update Error]', e));
          await interaction.followUp({
            content: `🔁 Loop mode updated to: **${newMode.toUpperCase()}**`,
            ephemeral: true
          }).catch(() => {});
          break;
        }

        case 'music_vol_down': {
          await interaction.deferUpdate();
          const newVol = Math.max(1, queue.volume - 10);
          queue.setVolume(newVol);
          await interaction.editReply(buildUpdatedPayload(interaction, queue)).catch((e) => console.error('[Vol- UI Update Error]', e));
          await interaction.followUp({ content: `🔉 Volume decreased to **${newVol}%**`, ephemeral: true }).catch(() => {});
          break;
        }

        case 'music_vol_up': {
          await interaction.deferUpdate();
          const newVol = Math.min(100, queue.volume + 10);
          queue.setVolume(newVol);
          await interaction.editReply(buildUpdatedPayload(interaction, queue)).catch((e) => console.error('[Vol+ UI Update Error]', e));
          await interaction.followUp({ content: `🔊 Volume increased to **${newVol}%**`, ephemeral: true }).catch(() => {});
          break;
        }

        case 'music_autodj_toggle': {
          await interaction.deferUpdate();
          const state = queue.toggleAutoDj();
          await interaction.editReply(buildUpdatedPayload(interaction, queue)).catch((e) => console.error('[AutoDJ UI Update Error]', e));
          await interaction.followUp({
            content: `🤖 **AI Auto-DJ is now:** \`${state ? '🟢 ENGAGED' : '⚪ DISABLED'}\``,
            ephemeral: true
          }).catch(() => {});
          break;
        }

        case 'music_queue': {
          const embed = createQueueEmbed(queue);
          await interaction.reply({ embeds: [embed], ephemeral: true });
          break;
        }

        case 'music_stop': {
          await interaction.reply({
            content: `⏹️ <@${interaction.user.id}> stopped the music session.`,
            ephemeral: isSetupChannel
          });
          queue.stop();
          break;
        }

        default:
          break;
      }
    }
  }
};
