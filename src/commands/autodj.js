const { SlashCommandBuilder } = require('discord.js');
const musicManager = require('../music/MusicManager');
const guildSettings = require('../music/GuildSettings');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('autodj')
    .setDescription('Toggle Auto-DJ (automatically queues related songs when the queue finishes)')
    .addBooleanOption(option =>
      option
        .setName('enabled')
        .setDescription('Turn Auto-DJ on or off')
        .setRequired(false)
    ),

  aliases: ['autodj', 'dj'],

  async execute(interaction) {
    const forced = interaction.options.getBoolean('enabled');
    const current = guildSettings.get(interaction.guildId).autoDj;
    const nextState = typeof forced === 'boolean' ? forced : !current;

    guildSettings.set(interaction.guildId, { autoDj: nextState });

    const queue = musicManager.get(interaction.guildId);
    if (queue) {
      queue.autoDj = nextState;
    }

    return interaction.reply(
      `📻 **Auto-DJ (Related Music) is now:** \`${nextState ? '🟢 ENABLED' : '⚪ DISABLED'}\`\n` +
      (nextState
        ? '✨ When your queue runs dry, I will automatically discover and queue a related song.'
        : '⏱️ Music will stop when the queue finishes.')
    );
  },

  async executeMessage(message, args) {
    const input = args[0]?.toLowerCase();
    let forced;
    if (['on', 'enable', '1', 'true'].includes(input)) forced = true;
    else if (['off', 'disable', '0', 'false'].includes(input)) forced = false;

    const current = guildSettings.get(message.guild.id).autoDj;
    const nextState = typeof forced === 'boolean' ? forced : !current;

    guildSettings.set(message.guild.id, { autoDj: nextState });

    const queue = musicManager.get(message.guild.id);
    if (queue) {
      queue.autoDj = nextState;
    }

    return message.reply(
      `📻 **Auto-DJ (Related Music) is now:** \`${nextState ? '🟢 ENABLED' : '⚪ DISABLED'}\`\n` +
      (nextState
        ? '✨ When your queue runs dry, I will automatically discover and queue a related song.'
        : '⏱️ Music will stop when the queue finishes.')
    );
  }
};
