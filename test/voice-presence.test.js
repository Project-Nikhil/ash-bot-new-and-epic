const test = require('node:test');
const assert = require('node:assert/strict');
const { setImmediate: flush } = require('node:timers/promises');

// Exercise the real voice adapter and queue without reading credentials or saving settings.
const settings = {
  cache: {},
  get(id) { return this.cache[id] ||= {}; },
  set(id, patch) { return this.cache[id] = { ...this.get(id), ...patch }; }
};
const config = { defaultVolume: 80, maxPlaylistImport: 100, maxQueueSize: 100 };
for (const [file, exports] of [['../src/config', config], ['../src/music/GuildSettings', settings]]) {
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

test('slash commands control the same player through buffering, pause, skip and stop', async t => {
  const { readdirSync } = require('node:fs');
  const { PassThrough } = require('node:stream');
  const { createAudioResource, StreamType } = require('@discordjs/voice');
  const { Track } = require('../src/music/Track');
  const { guild, channel, client } = fixture('commands');
  guild.name = 'Test server';
  client.user.displayAvatarURL = () => 'https://example.org/avatar.png';
  channel.permissionsFor = () => ({ has: () => true });
  const tracks = ['One', 'Two'].map(title => new Track({
    title, duration: 90, url: 'https://youtu.be/test', requestedBy: '123'
  }));
  t.mock.method(Track, 'resolve', async () => tracks);
  t.mock.method(Track.prototype, 'createAudioResource', () =>
    createAudioResource(new PassThrough({ objectMode: true }), { inputType: StreamType.Opus }));
  t.mock.method(global, 'fetch', async () => ({ ok: true, json: async () => ({ syncedLyrics: '[00:00]Test' }) }));
  const commands = new Map();
  for (const file of readdirSync(require('node:path').join(__dirname, '../src/commands'))) {
    const command = require('../src/commands/' + file);
    commands.set(command.data.toJSON().name, command);
  }
  const exercised = new Set();
  async function run(name, option) {
    const interaction = {
      guildId: guild.id, member: { voice: { channel } }, user: { id: '123' }, client,
      options: { getBoolean: () => option, getString: () => option, getInteger: () => option },
      deferReply: async () => {}, reply: value => value, editReply: value => value
    };
    const response = await commands.get(name).execute(interaction);
    assert.ok(response, name);
    for (const embed of response.embeds || []) embed.toJSON();
    assert.equal(response.components?.length || 0, 0);
    exercised.add(name);
  }
  await run('247', true);
  const queue = manager.get(guild.id);
  t.after(() => queue.destroy());
  await run('play', 'test');
  assert.equal(queue.currentTrack, tracks[0]);
  await run('pause');
  assert.equal(queue.isPaused, true);
  await run('filter', 'bassboost');
  assert.equal(queue.activeFilter, 'bassboost');
  queue.currentResource.playStream.write(Buffer.from([0xf8, 0xff, 0xfe]));
  await flush();
  assert.equal(queue.player.state.status, 'paused');
  await run('resume');
  assert.equal(queue.isPaused, false);
  await run('volume', 65);
  assert.equal(queue.volume, 65);
  await run('lyrics');
  await run('queue');
  await run('nowplaying');
  await run('help');
  await run('loop', 'track');
  await run('skip');
  assert.equal(queue.currentTrack, tracks[1]);
  await run('autodj', true);
  await run('stop');
  assert.equal(queue.player.state.status, 'idle');
  assert.equal(queue.destroyed, false);
  await run('leave');
  assert.equal(manager.get(guild.id), null);
  assert.deepEqual(exercised, new Set(commands.keys()));
});
