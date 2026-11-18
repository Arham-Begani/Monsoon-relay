const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {Worker: Thread} = require('node:worker_threads');

function load(extra = {}) {
  const ctx = vm.createContext({queueMicrotask, setTimeout, clearTimeout, ...extra});
  for (const file of ['streets.js', 'dispatch.js', 'protocol.js', 'runtime.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), ctx);
  }
  return ctx;
}

// Execute the production worker script in three independent JS engines.
class BrowserWorker {
  constructor(script, {name}) {
    this.thread = new Thread(`
      const {parentPort,workerData} = require('node:worker_threads');
      const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
      global.self = global;
      global.name = workerData.name;
      global.postMessage = message => parentPort.postMessage(message);
      global.importScripts = (...files) => files.forEach(file => vm.runInThisContext(
        fs.readFileSync(path.join(workerData.dir, file), 'utf8')));
      importScripts(workerData.script);
      parentPort.on('message', data => self.onmessage({data}));
    `, {eval: true, workerData: {name, script, dir: __dirname}});
    this.thread.on('message', data => this.onmessage?.({data}));
    this.thread.on('error', error => this.onerror?.(error));
  }
  postMessage(m) { this.thread.postMessage(m); }
  terminate() { this.thread.terminate(); }
}

for (const mode of ['workers', 'inline']) {
  test(mode + ' isolates overlapping scenarios and produces a correlated commitment ledger', async t => {
    const ctx = load({Worker: BrowserWorker, location: {protocol: mode === 'workers' ? 'https:' : 'file:'}});
    const runtime = ctx.createRelayRuntime();
    t.after(() => runtime.close());
    const closures = [[], [30], [30], vm.runInContext('Array.from(streets.roads.keys())', ctx)];
    const plans = await Promise.all(closures.map((ids,i) => runtime.run(new Set(ids), [8,8,20,0][i])));
    assert.deepEqual(plans.map(p => [p.total, p.baseline]), [[20,20],[12,0],[0,0],[0,0]]);
    assert.equal(new Set(plans.map(p => p.runId)).size, 4);
    for (const p of plans) {
      assert.equal(p.mode, mode);
      assert.equal(p.trace.filter(m => m.type === 'commit').reduce((n, m) => n + m.qty, 0), p.total);
      assert.ok(p.trace.every((m,i) => m.runId === p.runId && m.seq === i+1));
      assert.equal(p.total + p.gap, 20);
    }
    assert.deepEqual(Array.from(plans[1].trace, m => m.type), ['request','reject','request','offer','accept','commit','complete']);
  });
}

test('depot ignores unrelated runs and excess acceptance, and replays the same commitment', () => {
  const actor = load().createRelayActor('east', {runId:'A', closed:[30], reserved:8});
  const m = {runId:'A', from:'shelter', to:'east', type:'request', qty:20};
  assert.equal(actor.receive({...m, runId:'B'}), null);
  assert.equal(actor.receive(m).qty, 12);
  assert.equal(actor.receive({...m, type:'accept', qty:13}), null);
  const accept = {...m, type:'accept', qty:12};
  assert.equal(actor.receive(accept).type, 'commit');
  assert.equal(actor.receive(accept), actor.receive(accept));
  assert.equal(actor.receive({...accept, qty:1}), null);
});

test('worker failure restarts live negotiations in isolated inline actors', async t => {
  class FailedWorker {
    postMessage() { queueMicrotask(() => this.onerror()); }
    terminate() {}
  }
  const ctx = load({Worker: FailedWorker, location: {protocol: 'https:'}});
  const runtime = ctx.createRelayRuntime();
  t.after(() => runtime.close());
  const result = await runtime.run(new Set([30]), 6);
  assert.equal(result.mode, 'inline');
  assert.equal(result.eastQty, 14);
  assert.equal(result.trace.filter(m => m.type === 'commit').length, 1);
});

test('closing during startup rejects active and subsequent runs', async () => {
  const runtime = load({Worker: BrowserWorker, location:{protocol:'https:'}}).createRelayRuntime();
  const result = runtime.run(new Set(), 8);
  runtime.close();
  await assert.rejects(result, /closed/);
  await assert.rejects(runtime.run(new Set(), 8), /closed/);
});
