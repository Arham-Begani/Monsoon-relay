/* Simulated relief teams negotiate over one shared request in local memory. */
const scenario = { target: 20, deadline: 15, shelter: 338, west: 11, east: 728, speed: 105, loading: 2 };
const graph = Array.from(streets.nodes, () => []);
streets.roads.forEach((road, roadId) => {
  for (const run of road.runs) {
    for (let i = 1; i < run.length; i++) {
      const a = run[i-1], b = run[i];
      const [x, y] = streets.nodes[a], [u, v] = streets.nodes[b];
      const metres = Math.hypot(x-u, y-v) * 1.085;
      if (road.dir >= 0) graph[a].push({ to:b, roadId, metres });
      if (road.dir <= 0) graph[b].push({ to:a, roadId, metres });
    }
  }
});
function findRoute(origin, closed) {
  const distances = new Float64Array(graph.length).fill(Infinity);
  const previous = new Int32Array(graph.length).fill(-1);
  const open = new Set([origin]);
  distances[origin] = 0;
  while (open.size) {
    let next;
    for (const candidate of open) {
      if (next === undefined || distances[candidate] < distances[next]) next = candidate;
    }
    open.delete(next);
    if (next === scenario.shelter) break;
    for (const edge of graph[next]) {
      if (closed.has(edge.roadId)) continue;
      const cost = distances[next] + edge.metres;
      if (cost >= distances[edge.to]) continue;
      distances[edge.to] = cost;
      previous[edge.to] = next;
      open.add(edge.to);
    }
  }
  const distance = distances[scenario.shelter];
  if (!Number.isFinite(distance)) return { path: [], minutes: Infinity };
  const path = [];
  for (let n=scenario.shelter; n!==-1; n=previous[n]) path.push(n);
  return { path: path.reverse(), minutes: Math.ceil(distance / scenario.speed + scenario.loading) };
}
function offer(stock, reserved, vanCapacity, demand, route) {
  if (route.minutes > scenario.deadline) return 0;
  return Math.min(stock - reserved, vanCapacity, demand);
}
function dispatch(closed, reserved) {
  const west = findRoute(scenario.west, closed);
  const east = findRoute(scenario.east, closed);
  const westQty = offer(20, 0, 20, scenario.target, west);
  const needed = scenario.target - westQty;
  const eastQty = offer(20, reserved, 16, needed, east);
  const total = westQty + eastQty;
  const messages = [{ from:'Shelter', text:'Request 20 water crates within 15 minutes.' }];
  const eta = route => Number.isFinite(route.minutes) ? route.minutes + ' min' : 'no open route';
  messages.push({ from:'West depot', text: westQty ? 'Offer ' + westQty + ' crates. ETA ' + eta(west) + '.' : 'Unable to meet deadline (' + eta(west) + ').' });
  if (needed) {
    messages.push({ from:'Shelter', text:'Request the remaining ' + needed + ' from East depot.' });
    messages.push({ from:'East depot', text: eastQty ? 'Offer ' + eastQty + ' crates. ETA ' + eta(east) + '. '+reserved+' already pledged elsewhere.' : 'Unable to offer crates within the deadline.' });
  }
  messages.push({ from:'Shelter', text: total ? 'Accept ' + total + ' crates. ' + (scenario.target-total) + ' outstanding.' : 'No eligible offers. 20 crates outstanding.' });
  return { west, east, westQty, eastQty, total, gap: scenario.target-total, messages };
}
