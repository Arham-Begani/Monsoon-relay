const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const app = vm.createContext({});
for (const file of ['streets.js','dispatch.js']) {
  vm.runInContext(fs.readFileSync(path.join(__dirname,file),'utf8'),app);
}
const {dispatch,roads,graph} = vm.runInContext('({dispatch,roads:streets.roads,graph})',app);
assert.equal(dispatch(new Set(),8).westQty,20);
const example = dispatch(new Set([30]),8);
assert.equal(example.west.minutes,21);
assert.equal(example.east.minutes,8);
assert.equal(example.eastQty,12);
for (const id of roads.keys()) {
  const plan = dispatch(new Set([id]),8);
  assert.equal(plan.westQty + plan.eastQty + plan.gap,20);
  assert.ok(plan.eastQty<=12);
  for (const route of [plan.west,plan.east]) {
    route.path.slice(1).forEach((to,i) => {
      assert.ok(graph[route.path[i]].some(e=>e.to===to && e.roadId!==id));
    });
  }
}
for (let held=0;held<=20;held++) {
  assert.equal(dispatch(new Set([30]),held).eastQty,Math.min(16,20-held));
}
assert.equal(dispatch(new Set(roads.keys()),8).gap,20);
console.log('Passed baseline, '+roads.length+' road closures, 21 stock levels and a disconnected network.');
