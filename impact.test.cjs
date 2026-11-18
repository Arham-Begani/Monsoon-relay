const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function setup(extra = {}) {
  const ctx = vm.createContext({setTimeout, clearTimeout, queueMicrotask, ...extra});
  for (const file of ['streets.js','dispatch.js','protocol.js','runtime.js','impact.js']) {
    vm.runInContext(fs.readFileSync(path.join(__dirname, file), 'utf8'), ctx);
  }
  return ctx;
}

test('every remaining road is ranked, including three baseline handoffs', async t => {
  const ctx = setup();
  const analyzer = ctx.createImpactAnalyzer();
  t.after(() => analyzer.close());
  const result = await analyzer.run(new Set(), 8);
  assert.equal(result.tested, 294);
  assert.equal(result.handoffs, 3);
  assert.equal(result.losses, 3);
  assert.equal(new Set(result.rows.map(row => row.id)).size, 294);
  assert.equal(result.rows.slice(0,3).every(row => row.total === 12 && row.gain === 12), true);
  assert.equal(result.base.total, 20);
});

test('compound closures and reserve match independent actor negotiations for every remaining section', async t => {
  const ctx = setup();
  const runtime = ctx.createRelayRuntime(), analyzer = ctx.createImpactAnalyzer();
  t.after(() => { runtime.close(); analyzer.close(); });
  const closures = new Set([30, 8]);
  const result = await analyzer.run(closures, 11);
  assert.equal(result.tested, 292);
  let losses = 0;
  for (const row of result.rows) {
    assert.ok(!closures.has(row.id));
    const p = await runtime.run(new Set([...closures, row.id]), 11);
    assert.deepEqual([row.total,row.westQty,row.eastQty,row.gap,row.gain,row.westMinutes,row.eastMinutes],
      [p.total,p.westQty,p.eastQty,p.gap,p.total-p.baseline,p.west.minutes,p.east.minutes]);
    if (p.total < result.base.total) losses++;
  }
  assert.equal(result.losses, losses);
});

test('analysis recovers from worker failure and cancels on close', async () => {
  class FailedWorker {
    postMessage() { queueMicrotask(() => this.onerror()); }
    terminate() {}
  }
  const ctx = setup({Worker:FailedWorker, location:{protocol:'https:'}});
  const analyzer = ctx.createImpactAnalyzer();
  const result = await analyzer.run([], 20);
  assert.equal(result.handoffs, 0);
  assert.equal(result.losses, 3);
  const pending = analyzer.run([], 8);
  analyzer.close();
  await assert.rejects(pending, /closed/);
  await assert.rejects(analyzer.run([], 8), /closed/);
});
