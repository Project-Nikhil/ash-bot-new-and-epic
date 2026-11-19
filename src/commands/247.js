const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const guildSettings = require('../music/GuildSettings');
const musicManager = require('../music/MusicManager');

function toggle247({ guildId, voiceChannel, textChannel, forcedState }) {
  const settings = guildSettings.get(guildId);
  const enabled = typeof forcedState === 'boolean' ? forcedState : !settings.stay247;
  const queue = musicManager.get(guildId);

  if (!enabled) {
    guildSettings.set(guildId, { stay247: false });
    if (queue && !queue.currentTrack && !queue.tracks.length) queue.startIdleTimer();
    return '24/7 mode disabled. Ash will leave after 3 minutes of inactivity.';
  }

  const targetId = queue?.voiceChannel?.id || voiceChannel?.id || settings.voiceChannelId;
  if (!targetId) return 'Join the voice channel you want Ash to stay in, then run `/247 enabled:True`.';

  guildSettings.set(guildId, { stay247: true, voiceChannelId: targetId, textChannelId: textChannel?.id });
  if (queue) queue.resetIdleTimer();
  else if (voiceChannel?.id === targetId) {
    musicManager.getOrCreate({ guildId, voiceChannel, textChannel });
  }
  return `24/7 mode enabled for <#${targetId}>. Ash will stay when the channel is empty and rejoin after a disconnect.`;
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('247')
    .setDescription('Toggle 24/7 mode (keeps the bot in the voice channel permanently)')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
    .addBooleanOption(option =>
      option
        .setName('enabled')
        .setDescription('Turn 24/7 mode on or off')
        .setRequired(false)
    ),

  aliases: ['247', '24/7', 'stay', 'afk'],

  async execute(interaction) {
    await interaction.deferReply();
    const forced = interaction.options.getBoolean('enabled');
    const response = toggle247({
      guildId: interaction.guildId,
      voiceChannel: interaction.member?.voice?.channel,
      textChannel: interaction.channel,
      forcedState: forced !== null ? forced : undefined
    });

    return interaction.editReply(response);
  },

  async executeMessage(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('❌ You need the **Manage Server** permission to toggle 24/7 mode!');
    }

    const input = args[0]?.toLowerCase();
    let forced;
    if (['on', 'enable', '1', 'true'].includes(input)) forced = true;
    else if (['off', 'disable', '0', 'false'].includes(input)) forced = false;

    const response = toggle247({
      guildId: message.guild.id,
      voiceChannel: message.member?.voice?.channel,
      textChannel: message.channel,
      forcedState: forced
    });

    return message.reply(response);
  }
};
