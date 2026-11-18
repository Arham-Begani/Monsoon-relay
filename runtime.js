function createRelayRuntime() {
  const roles = ['west', 'east', 'shelter'];
  const names = {west: 'West depot', east: 'East depot', shelter: 'Shelter'};
  const workers = new Map();
  const runs = new Map();
  let next = 0;
  let stopped = false;
  function terminateWorkers() {
    for (const worker of workers.values()) worker.terminate();
    workers.clear();
  }
  function fallback() {
    if (!workers.size) return;
    terminateWorkers();
    for (const run of runs.values()) run.start();
  }
  if (typeof Worker === 'function' && location.protocol !== 'file:') {
    try {
      for (const role of roles) {
        const worker = new Worker('worker.js', {name: role});
        workers.set(role, worker);
        worker.onmessage = ({data}) => {
          if (workers.get(role) === worker) runs.get(data.runId)?.receive(role, data);
        };
        worker.onerror = fallback;
        worker.onmessageerror = fallback;
      }
    } catch { terminateWorkers(); }
  }
  function run(closed, reserved) {
    if (stopped) return Promise.reject(new Error('Relay runtime is closed.'));
    if (!Number.isInteger(reserved) || reserved < 0 || reserved > 20) return Promise.reject(new RangeError('Reserved crates must be an integer from 0 to 20.'));
    const runId = 'run-' + ++next;
    const config = {type: 'init', runId, closed: Array.from(closed), reserved};
    return new Promise((resolve, reject) => {
      let timer, mode, actors, routes, trace, delivered;
      const clean = () => {
        clearTimeout(timer);
        runs.delete(runId);
        for (const w of workers.values()) w.postMessage({type: 'release', runId});
      };
      function fail(error) { clean(); reject(error); }
      function deliver(msg) {
        if (mode === 'workers') return workers.get(msg.to).postMessage(msg);
        queueMicrotask(() => {
          if (!runs.has(runId)) return;
          try {
            const result = actors[msg.to].receive(msg);
            if (result) receive(msg.to, result);
          } catch (error) { fail(error); }
        });
      }
      function receive(role, msg) {
        if (msg.type === 'ready') {
          if (routes.has(role)) return;
          routes.set(role, msg.route);
          if (routes.size === roles.length) deliver({type: 'start', from: 'runtime', to: 'shelter', runId, qty: 0});
          return;
        }
        if (msg.from !== role) return;
        const key = [role, msg.to, msg.type].join('/');
        if (delivered.has(key)) return;
        delivered.add(key);
        trace.push({seq: trace.length + 1, ...msg});
        if (msg.type !== 'complete') return deliver(msg);
        const west = routes.get('west'), east = routes.get('east');
        const plan = {runId, mode, west, east, westQty: msg.west, eastQty: msg.east, total: msg.qty,
          gap: scenario.target - msg.qty, baseline: offer(20, 0, 20, scenario.target, west), trace,
          messages: trace.map(event => ({...event, from: names[event.from]}))};
        clean();
        resolve(plan);
      }
      function start() {
        clearTimeout(timer);
        mode = workers.size ? 'workers' : 'inline';
        routes = new Map();
        trace = [];
        delivered = new Set();
        actors = {};
        timer = setTimeout(() => {
          if (mode === 'workers') fallback();
          else fail(new Error('Relay negotiation timed out.'));
        }, 5000);
        try {
          for (const role of roles) {
            if (mode === 'workers') workers.get(role).postMessage(config);
            else {
              actors[role] = createRelayActor(role, config);
              receive(role, {type: 'ready', route: actors[role].route});
            }
          }
        } catch (error) {
          if (mode === 'workers') fallback();
          else fail(error);
        }
      }
      runs.set(runId, {start, receive, fail});
      start();
    });
  }
  return {run, close() {
    stopped = true;
    terminateWorkers();
    for (const pending of runs.values()) pending.fail(new Error('Relay runtime closed.'));
  }};
}
