const { Events } = require('discord.js');
const config = require('../config');

module.exports = {
  name: Events.MessageCreate,
  async execute(message, client) {
    if (message.author.bot || !message.guild) return;

    const prefix = config.prefix.toLowerCase();
    if (!message.content.toLowerCase().startsWith(prefix)) return;

    const raw = message.content.slice(config.prefix.length).trim();
    if (!raw) return;

    const args = raw.split(/\s+/);
    const commandName = args.shift().toLowerCase();
    const command = client.commands.get(commandName) || client.aliases.get(commandName);
    if (!command) return;

    try {
      if (typeof command.executeMessage === 'function') {
        await command.executeMessage(message, args);
      }
    } catch (error) {
      console.error(`[Command Error] "${commandName}":`, error);
      message.reply('❌ An error occurred while executing this command.').catch(() => {});
    }
  }
};
