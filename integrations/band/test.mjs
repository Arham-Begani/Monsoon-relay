import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GenericAdapter } from '@band-ai/sdk';
import { FakeAgentTools } from '@band-ai/sdk/testing';
import { handler, diskStore, roadCount } from './protocol.mjs';

const ids = { shelter: 'id-shelter', west: 'id-west', east: 'id-east' };
function start(input, roomId = 'room', id = 'origin') {
  return { recipient: ids.shelter, message: { roomId, id, senderType: 'User', senderId: 'resident',
    content: '@shelter relay ' + JSON.stringify(input) } };
}
function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'monsoon-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  let serial = 0;
  async function deliver({recipient, message}, tools = new FakeAgentTools()) {
    const role = Object.keys(ids).find(role => ids[role] === recipient);
    // Reconstruct each adapter and reopen its disk journal on every delivery.
    const adapter = new GenericAdapter(handler(role, ids, diskStore(join(dir, role))));
    await adapter.onMessage(message, tools, {}, null, null, { roomId: message.roomId, isSessionBootstrap: false });
    return tools.messagesSent.map(sent => ({
      recipient: sent.mentions[0].id, message: { id: 'frame-' + ++serial, roomId: message.roomId,
        senderType: 'Agent', senderId: recipient, content: sent.content }
    }));
  }
  async function pump(queue) {
    const results = [];
    while (queue.length) {
      const item = queue.shift();
      if (item.recipient === 'resident') { results.push(item); continue; }
      const next = await deliver(item);
      assert.deepEqual(await deliver(item), [], 'duplicate delivery emitted another decision');
      queue.push(...next);
    }
    return results;
  }
  return { deliver, pump };
}

test('SDK room fixture routes, commits, and isolates interleaved runs', async t => {
  const {pump} = fixture(t);
  const records = await pump([
    start({closed: [], reserve: 8}),
    start({closed: [30], reserve: 8}, 'other-room'),
    start({closed: [30], reserve: 0}, 'room', 'second'),
    start({closed: Array.from({length: roadCount}, (_, i) => i), reserve: 20}, 'other-room', 'cut-off')
  ]);
  const summary = (room, run) => records.find(r => r.message.roomId === room &&
    r.message.content.startsWith('Simulation ' + run + ' complete')).message.content;
  assert.equal(records.length, 4);
  assert.match(summary('room', 'origin'), /west 20, east 0.*0 outstanding/);
  assert.match(summary('other-room', 'origin'), /west 0, east 12.*8 outstanding/);
  assert.match(summary('room', 'second'), /west 0, east 16.*4 outstanding/);
  assert.match(summary('other-room', 'cut-off'), /0\/20.*20 outstanding/);
});

test('failed send resumes after restart and rejects forged peer identities', async t => {
  const {deliver, pump} = fixture(t);
  const command = start({closed: [30, 31], reserve: 20});
  await assert.rejects(deliver(command, new FakeAgentTools({failOn:['sendMessage']})));
  const [request] = await deliver(command);
  const spoof = {...request, message: {...request.message, senderId:'unknown-agent'}};
  assert.deepEqual(await deliver(spoof), []);
  const [result] = await pump([request]);
  assert.match(result.message.content, /20 outstanding/);
});

test('invalid reserve or unknown road returns usage to the human', async t => {
  const {deliver} = fixture(t);
  for (const input of [{closed:[roadCount],reserve:0}, {closed:[], reserve:-1}, {closed:['30'], reserve:8}]) {
    const [response] = await deliver(start(input));
    assert.equal(response.recipient, 'resident');
    assert.match(response.message.content, /Supply map road IDs/);
  }
});

test('provisioning saves one-time credentials privately, resumes after quota rejection and reuses room', async t => {
  const { provision } = await import('./provision.mjs');
  const {statSync} = await import('node:fs');
  const dir = mkdtempSync(join(tmpdir(),'monsoon-owner-'));
  t.after(() => rmSync(dir, { recursive:true, force:true }));
  let registrations = 0, rooms = 0, quota = true;
  const post = async (path, body) => {
    if (path === '/agents/register') {
      if (registrations === 1 && quota) throw Object.assign(new Error('quota'),{definitive:true});
      registrations++;
      return {agent:{id:'id-' + registrations},credentials:{api_key:'test-' + registrations}};
    }
    assert.equal(path,'/chats');
    assert.equal(body.chat.participants.length,3);
    rooms++;
    return {id:'test-room'};
  };
  await assert.rejects(provision(dir, post), /quota/);
  quota = false;
  assert.equal(await provision(dir,post), 'test-room');
  assert.equal(await provision(dir,post), 'test-room');
  assert.equal(registrations,3);
  assert.equal(rooms,1);
  assert.equal(statSync(join(dir,'peers.env')).mode & 0o777,0o600);
});

test('REST peers authenticate independently, exchange room deliveries and acknowledge the originating IDs', async () => {
  const {roomApi, drainOne} = await import('./rest-peer.mjs');
  const queue = Object.fromEntries(Object.values(ids).map(id => [id, []]));
  const phases = new Map();
  const final = [];
  const origin = 'test-origin';
  queue[ids.shelter].push({id:origin, sender_id:'resident', sender_type:'User', message_type:'text',
    content:'@[[id-shelter]] relay {"closed":[30],"reserve":8}', chat_room_id:'room'});
  let serial = 0;
  const peers = {};
  for (const [role,id] of Object.entries(ids)) {
    const transport = async (url, options) => {
      const path = new URL(url).pathname;
      assert.equal(new Headers(options.headers).get('x-api-key'), 'fixture-' + id);
      const respond = data => Response.json({data});
      if (path.endsWith('/me')) return respond({id,name:role});
      if (path.endsWith('/chats/room')) return respond({id:'room', inserted_at:'2026-01-01', updated_at:'2026-01-01'});
      if (path.endsWith('/messages/next')) {
        return queue[id].length ? respond(queue[id][0]) : new Response(null,{status:204});
      }
      if (path.endsWith('/processing') || path.endsWith('/processed')) {
        const [messageId,status] = path.split('/').slice(-2);
        assert.equal(messageId,queue[id][0].id);
        if (status === 'processed') {
          assert.equal(phases.get(messageId),'processing');
          queue[id].shift();
        }
        phases.set(messageId,status);
        return respond({success:true});
      }
      assert.ok(path.endsWith('/messages'));
      const {message} = JSON.parse(options.body);
      const recipient = message.mentions[0].id;
      const frame = {id:'live-' + ++serial,sender_id:id,sender_type:'Agent',message_type:'text',
        metadata:{mentions:message.mentions}, content:'@[[' + recipient + ']] ' + message.content};
      if (recipient === 'resident') final.push(frame);
      else queue[recipient].push(frame);
      return respond({id:frame.id,success:true,recipients:[{id:recipient}]});
    };
    const api = roomApi({apiKey:'fixture-' + id,agentId:id},transport);
    await api.authenticate('room');
    peers[role] = {api, handle:handler(role,ids,new Map())};
  }
  for (let round=0; round<10 && !final.length; round++) {
    for (const {api,handle} of Object.values(peers)) await drainOne(api,'room',handle);
  }
  assert.equal(final.length,1);
  assert.equal(final[0].sender_id,ids.shelter);
  assert.match(final[0].content,/Simulation test-origin complete. 12\/20 crates committed .*8 outstanding/);
  assert.ok([...phases.values()].every(value => value === 'processed'));
});
