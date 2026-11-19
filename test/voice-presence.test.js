const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: flush } = require('node:timers/promises');

// Exercise the real voice adapter and queue without reading credentials or saving settings.
const settings = {
  cache: {},
  get(id) { return this.cache[id] ||= {}; },
  set(id, patch) { return this.cache[id] = { ...this.get(id), ...patch }; }
};
for (const [file, exports] of [['../src/config', {}], ['../src/music/GuildSettings', settings]]) {
  const id = require.resolve(file);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
const VoicePresence = require('../src/music/VoicePresence');
const manager = require('../src/music/MusicManager');
const voiceUpdate = require('../src/events/voiceStateUpdate');
const leave = require('../src/commands/leave');

function fixture(guildId) {
  const packets = [];
  const guild = {
    id: guildId, available: true, members: { me: { voice: { channelId: null } } },
    voiceAdapterCreator: () => ({
      sendPayload(packet) { packets.push(packet.d.channel_id); return true; },
      destroy() {}
    })
  };
  const channel = { id: 'home', guildId, guild, isVoiceBased: () => true };
  const client = {
    user: { id: 'bot' }, guilds: { cache: new Map([[guildId, guild]]) },
    isReady: () => true, channels: { fetch: async () => channel }
  };
  settings.set(guildId, { stay247: true, voiceChannelId: channel.id });
  return { guild, channel, client, packets, presence: new VoicePresence(client) };
}

test('recovers past five failed handshakes, stays put while healthy, and returns after a move', async t => {
  let now = 0;
  t.mock.method(Date, 'now', () => now);
  const { guild, channel, client, packets, presence } = fixture('one');
  presence.check();
  await flush();
  const queue = manager.get(guild.id);
  t.after(() => queue.destroy());
  for (let attempt = 0; attempt < 8; attempt++) {
    now += 60000;
    presence.check();
    presence.check();
    await flush();
  }
  assert.deepEqual(packets, Array(9).fill(channel.id));
  assert.equal(queue.connection.listenerCount('stateChange'), 1);

  queue.connection.state = { ...queue.connection.state, status: 'ready' };
  guild.members.me.voice.channelId = channel.id;
  queue.stop();
  queue.startIdleTimer();
  queue.handleAloneTimeout();
  for (let day = 0; day < 31; day++) {
    now += 86400000;
    presence.check();
  }
  assert.equal(queue.destroyed, false);
  assert.equal(queue.idleTimer, null);
  assert.equal(packets.length, 9);

  guild.members.me.voice.channelId = 'elsewhere';
  await voiceUpdate.execute({ guild, id: 'bot', channelId: 'home' },
    { guild, id: 'bot', channelId: 'elsewhere' }, client);
  presence.check();
  now += 15000;
  presence.check();
  await flush();
  assert.equal(settings.get(guild.id).voiceChannelId, 'home');
  assert.deepEqual(packets.slice(9), ['home']);
});

test('retries a failed startup fetch and honors /leave during an outstanding fetch', async () => {
  const { guild, channel, client, packets, presence } = fixture('two');
  let attempts = 0;
  let resolveFetch;
  client.channels.fetch = () => {
    attempts++;
    if (attempts === 1) return Promise.reject(new Error('temporary outage'));
    return new Promise(resolve => { resolveFetch = resolve; });
  };
  presence.check();
  await flush();
  assert.equal(settings.get(guild.id).stay247, true);
  presence.retries.get(guild.id).due = 0;
  presence.check();
  presence.check();
  assert.equal(attempts, 2);
  await leave.execute({ guildId: guild.id, reply() {} });
  resolveFetch(channel);
  await flush();
  presence.check();
  assert.equal(manager.get(guild.id), null);
  assert.deepEqual(packets, []);
  assert.equal(settings.get(guild.id).stay247, false);
});
