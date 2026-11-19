const { Events } = require('discord.js');
const musicManager = require('../music/MusicManager');
const guildSettings = require('../music/GuildSettings');

module.exports = {
  name: Events.InteractionCreate,
  async execute(interaction, client) {
    // Handle Slash Commands
    if (interaction.isChatInputCommand()) {
      const command = client.commands.get(interaction.commandName);
      if (!command) return;

      try {
        await command.execute(interaction);
      } catch (error) {
        console.error(`[ERROR] Command ${interaction.commandName}:`, error);
        const payload = { content: '❌ An error occurred while executing this command!', ephemeral: true };
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload).catch(() => {});
        } else {
          await interaction.reply(payload).catch(() => {});
        }
      }
    }
  }
};
