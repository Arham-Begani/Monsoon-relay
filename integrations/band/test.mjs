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
