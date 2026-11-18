// Both transports evaluate the same one-more-closure experiment.
async function analyzeRoadImpact(closed, reserved, checkActive = () => {}) {
  const blocked = new Set(closed);
  const base = dispatch(blocked, reserved);
  const rows = [];
  let handoffs = 0, losses = 0;
  for (const id of streets.roads.keys()) {
    if (blocked.has(id)) continue;
    if (rows.length % 20 === 0) {
      await new Promise(resolve => setTimeout(resolve, 0));
      checkActive();
    }
    blocked.add(id);
    const plan = dispatch(blocked, reserved);
    blocked.delete(id);
    if (base.westQty > 0 && plan.eastQty > base.eastQty) handoffs++;
    if (plan.total < base.total) losses++;
    rows.push({id, total: plan.total, westQty: plan.westQty, eastQty: plan.eastQty,
      westMinutes: plan.west.minutes, eastMinutes: plan.east.minutes,
      gap: plan.gap, gain: plan.total - plan.westQty});
  }
  const etaChange = (minutes, previous) => minutes === previous ? 0 : minutes - previous;
  const delay = row => Math.max(etaChange(row.westMinutes, base.west.minutes),
    etaChange(row.eastMinutes, base.east.minutes));
  rows.sort((a, b) => {
    if (a.total !== b.total) return a.total - b.total;
    if (a.westQty !== b.westQty) return a.westQty - b.westQty;
    const ad = delay(a), bd = delay(b);
    if (ad !== bd) return ad > bd ? -1 : 1;
    const al = streets.roads[a.id].label, bl = streets.roads[b.id].label;
    return al < bl ? -1 : al > bl ? 1 : a.id - b.id;
  });
  return {tested: rows.length, base: {total: base.total, westQty: base.westQty, eastQty: base.eastQty},
    handoffs, losses, rows};
}

function createImpactAnalyzer() {
  const pending = new Map();
  let worker, sequence = 0, closed = false;
  function finish(id, value, error) {
    const job = pending.get(id);
    if (!job) return;
    clearTimeout(job.timer);
    pending.delete(id);
    if (error) job.reject(error);
    else job.resolve(value);
  }
  function inline(id, job) {
    clearTimeout(job.timer);
    job.timer = setTimeout(() => finish(id, null, new Error('Road analysis timed out.')), 10000);
    analyzeRoadImpact(job.ids, job.reserved, () => {
      if (!pending.has(id)) throw new Error('Road analysis stopped.');
    }).then(result => finish(id, result), error => finish(id, null, error));
  }
  function recover() {
    if (!worker) return;
    worker.terminate();
    worker = null;
    for (const [id, job] of pending) inline(id, job);
  }
  if (typeof Worker === 'function' && location.protocol !== 'file:') {
    try {
      worker = new Worker('impact-worker.js', {name:'road-impact'});
      worker.onmessage = ({data}) => {
        if (worker) finish(data.id, data.result, data.error && new Error(data.error));
      };
      worker.onerror = recover;
      worker.onmessageerror = recover;
    } catch { worker = null; }
  }
  return {
    run(closures, reserved) {
      if (closed) return Promise.reject(new Error('Road analyzer is closed.'));
      if (!Number.isInteger(reserved) || reserved < 0 || reserved > 20) {
        return Promise.reject(new RangeError('Reserved crates must be an integer from 0 to 20.'));
      }
      const ids = Array.from(closures);
      const id = ++sequence;
      return new Promise((resolve, reject) => {
        const job = {ids, reserved, resolve, reject};
        pending.set(id, job);
        if (worker) {
          job.timer = setTimeout(recover, 10000);
          try { worker.postMessage({id, ids, reserved}); } catch { recover(); }
        } else inline(id, job);
      });
    },
    close() {
      closed = true;
      if (worker) worker.terminate();
      worker = null;
      for (const id of pending.keys()) finish(id, null, new Error('Road analyzer closed.'));
    }
  };
}
