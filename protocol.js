// Each actor owns its transaction state. One simulated run has one request per depot.
function createRelayActor(role, config) {
  const {runId, closed, reserved} = config;
  const route = role === 'shelter' ? null : findRoute(scenario[role], new Set(closed));
  const envelope = (type, to, qty, text) => ({runId, type, from: role, to, qty, text});
  const received = new Map();
  let offered = 0;
  let active = 'west';
  let expected = 'start';
  let accepted = 0;
  const committed = {west: 0, east: 0};
  function depot(m) {
    if (m.from !== 'shelter') return null;
    if (m.type === 'request' && expected === 'start') {
      const held = role === 'east' ? reserved : 0;
      offered = offer(20, held, role === 'east' ? 16 : 20, m.qty, route);
      expected = offered ? 'accept' : 'done';
      const reason = !Number.isFinite(route.minutes) ? 'No open route.' :
        route.minutes > scenario.deadline ? 'ETA ' + route.minutes + ' min exceeds the deadline.' :
        'All stock is pledged elsewhere.';
      const detail = role === 'east' ? ' ' + held + ' already pledged elsewhere.' : '';
      return offered ? envelope('offer', 'shelter', offered, 'Offer ' + offered + ' crates. ETA ' + route.minutes + ' min.' + detail) :
        envelope('reject', 'shelter', 0, reason);
    }
    if (m.type === 'accept' && expected === 'accept' && m.qty > 0 && m.qty <= offered) {
      expected = 'done';
      return envelope('commit', 'shelter', m.qty, 'Committed ' + m.qty + ' crates for delivery.');
    }
    return null;
  }
  function request(qty) {
    expected = 'reply';
    return envelope('request', active, qty, 'Request ' + qty + ' crates from ' + active + ' within ' + scenario.deadline + ' minutes.');
  }
  function shelter(m) {
    if (expected === 'start' && m.type === 'start' && m.from === 'runtime') return request(scenario.target);
    if (m.from !== active) return null;
    const remaining = scenario.target - committed.west - committed.east;
    if (expected === 'reply' && m.type === 'offer' && m.qty > 0 && m.qty <= remaining) {
      accepted = m.qty;
      expected = 'commit';
      return envelope('accept', active, accepted, 'Accept ' + accepted + ' crates from ' + active + '.');
    }
    if (expected === 'commit' && m.type === 'commit' && m.qty === accepted) committed[active] = accepted;
    else if (!(expected === 'reply' && m.type === 'reject' && m.qty === 0)) return null;
    const total = committed.west + committed.east;
    if (active === 'west' && total < scenario.target) {
      active = 'east';
      return request(scenario.target - total);
    }
    expected = 'done';
    return {...envelope('complete', 'runtime', total, total + ' crates committed. ' + (scenario.target - total) + ' outstanding.'), ...committed};
  }
  return {route, receive(m) {
    if (!m || m.runId !== runId || m.to !== role || !Number.isInteger(m.qty) || m.qty < 0 || m.qty > scenario.target) return null;
    const key = [m.from, m.type, m.qty].join('/');
    if (received.has(key)) return received.get(key);
    const response = role === 'shelter' ? shelter(m) : depot(m);
    if (response) received.set(key, response);
    return response;
  }};
}
