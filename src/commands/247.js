const { SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
const guildSettings = require('../music/GuildSettings');
const musicManager = require('../music/MusicManager');

async function toggle247({ guildId, client, voiceChannel, textChannel, forcedState }) {
  const current = guildSettings.get(guildId).stay247;
  const nextState = typeof forcedState === 'boolean' ? forcedState : !current;

  guildSettings.set(guildId, { stay247: nextState });

  let queue = musicManager.get(guildId);

  if (nextState) {
    if (queue) {
      queue.resetIdleTimer();
    } else if (voiceChannel) {
      // Join voice channel immediately if user is in one
      queue = musicManager.getOrCreate({
        guildId,
        voiceChannel,
        textChannel
      });
    }
  } else {
    if (queue && !queue.currentTrack && queue.tracks.length === 0) {
      queue.startIdleTimer();
    }
  }

  await musicManager.refreshDashboard(client, guildId, queue);
  return nextState;
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
    const newState = await toggle247({
      guildId: interaction.guildId,
      client: interaction.client,
      voiceChannel: interaction.member?.voice?.channel,
      textChannel: interaction.channel,
      forcedState: forced !== null ? forced : undefined
    });

    return interaction.editReply(
      `📻 **24/7 Voice Mode is now:** \`${newState ? '🟢 ENABLED' : '⚪ DISABLED'}\`\n` +
      (newState
        ? '✨ I will stay in your voice channel 24/7 without auto-disconnecting.'
        : '⏱️ I will auto-leave the voice channel after 3 minutes of inactivity.')
    );
  },

  async executeMessage(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply('❌ You need the **Manage Server** permission to toggle 24/7 mode!');
    }

    const input = args[0]?.toLowerCase();
    let forced;
    if (['on', 'enable', '1', 'true'].includes(input)) forced = true;
    else if (['off', 'disable', '0', 'false'].includes(input)) forced = false;

    const newState = await toggle247({
      guildId: message.guild.id,
      client: message.client,
      voiceChannel: message.member?.voice?.channel,
      textChannel: message.channel,
      forcedState: forced
    });

    return message.reply(
      `📻 **24/7 Voice Mode is now:** \`${newState ? '🟢 ENABLED' : '⚪ DISABLED'}\`\n` +
      (newState
        ? '✨ I will stay in your voice channel 24/7 without auto-disconnecting.'
        : '⏱️ I will auto-leave the voice channel after 3 minutes of inactivity.')
    );
  }
};
