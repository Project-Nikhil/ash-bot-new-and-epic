/**
 * Server Owner Utility Helper
 * Allows Ash bot to identify and verify the server owner.
 */

/**
 * Checks if a given user/member is the owner of the guild
 * @param {import('discord.js').Guild} guild
 * @param {string|object} userOrMember
 * @returns {boolean}
 */
function isServerOwner(guild, userOrMember) {
  if (!guild || !guild.ownerId) return false;
  const userId = typeof userOrMember === 'string'
    ? userOrMember
    : (userOrMember?.id || userOrMember?.user?.id);
  return guild.ownerId === userId;
}

/**
 * Fetches the GuildMember of the server owner
 * @param {import('discord.js').Guild} guild
 * @returns {Promise<import('discord.js').GuildMember|null>}
 */
async function fetchServerOwner(guild) {
  if (!guild) return null;
  try {
    return await guild.fetchOwner();
  } catch (err) {
    console.error(`[OwnerFetch Error] Guild ${guild.id}:`, err.message);
    return null;
  }
}

module.exports = {
  isServerOwner,
  fetchServerOwner
};
