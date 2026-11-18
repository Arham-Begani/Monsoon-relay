import { createHash } from 'node:crypto';
import { readFileSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';

// Evaluate the same checked-in map and routing functions as the browser.
const context = vm.createContext({});
for (const file of ['streets.js', 'dispatch.js']) {
  vm.runInContext(readFileSync(new URL('../../' + file, import.meta.url), 'utf8'), context);
}
const { scenario, findRoute, offer, roads } = vm.runInContext(
  '({scenario, findRoute, offer, roads: streets.roads.length})', context);
export const roadCount = roads;
const qty = n => Number.isInteger(n) && n >= 0 && n <= scenario.target;
function valid(input) {
  return input && Array.isArray(input.closed) && input.closed.length <= roads &&
    input.closed.every(id => Number.isInteger(id) && id >= 0 && id < roads) && qty(input.reserve);
}

export function diskStore(dir) {
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const path = key => join(dir, createHash('sha256').update(key).digest('hex') + '.json');
  return {
    get(key) {
      try { return JSON.parse(readFileSync(path(key), 'utf8')); }
      catch (error) { if (error.code !== 'ENOENT') throw error; }
    },
    set(key, value) {
      const dest = path(key);
      writeFileSync(dest + '.tmp', JSON.stringify(value), { mode: 0o600 });
      renameSync(dest + '.tmp', dest);
    }
  };
}

function next(role, from, p, state) {
  const wire = (to, type, summary, data = {}) => ({
    to, content: summary + '\nMR1 ' + JSON.stringify({ run: p.run, type, ...data })
  });
  const request = (to, demand) => wire(to, 'request',
    'Request ' + demand + ' crates from ' + to + ' within 15 minutes.',
    { demand, input: state.input });
  if (role === 'shelter') {
    if (p.type === 'start' && !state.phase) {
      Object.assign(state, { phase: 'west:offer', user: from, input: p.input, west: 0, east: 0 });
      return request('west', scenario.target);
    }
    if (!['west','east'].includes(from) || state.phase !== from + ':' + p.type || !qty(p.amount)) return;
    if (p.type === 'offer') {
      if (p.amount > scenario.target - state.west) return;
      if (p.amount > 0) {
        state.amount = p.amount;
        state.phase = from + ':committed';
        return wire(from, 'accept', 'Accept ' + p.amount + ' crates from ' + from + '.', { amount: p.amount });
      }
    } else if (p.type === 'committed' && p.amount === state.amount) {
      state[from] = p.amount;
    } else return;
    if (from === 'west' && state.west < scenario.target) {
      state.phase = 'east:offer';
      return request('east', scenario.target - state.west);
    }
    state.phase = 'done';
    const total = state.west + state.east;
    return { to: state.user, content: 'Simulation ' + p.run + ' complete. ' + total +
      '/20 crates committed (west ' + state.west + ', east ' + state.east + '). ' +
      (scenario.target - total) + ' outstanding.' };
  }
  if (from !== 'shelter') return;
  if (p.type === 'request' && !state.phase && valid(p.input) && qty(p.demand)) {
    const route = findRoute(scenario[role], new Set(p.input.closed));
    const amount = offer(20, role === 'east' ? p.input.reserve : 0, role === 'east' ? 16 : 20, p.demand, route);
    Object.assign(state, { phase: 'offered', amount });
    const eta = Number.isFinite(route.minutes) ? route.minutes + ' min' : 'no open route';
    return wire('shelter', 'offer', role + ' offers ' + amount + ' crates. ETA ' + eta + '.', { amount });
  }
  if (p.type === 'accept' && state.phase === 'offered' && state.amount > 0 && p.amount === state.amount) {
    state.phase = 'committed';
    return wire('shelter', 'committed', role + ' commits ' + p.amount + ' crates.', { amount: p.amount });
  }
}

export function handler(role, ids, store) {
  const peers = Object.fromEntries(Object.entries(ids).map(([name, id]) => [id, name]));
  let tail = Promise.resolve();
  async function handle({ message: m, tools }) {
    const sender = Object.hasOwn(peers, m.senderId) ? peers[m.senderId] : null;
    const human = String(m.senderType).toLowerCase() === 'user';
    let p;
    if (human && role === 'shelter' && !sender) {
      const match = m.content.match(/(?:^|\s)relay\s+(\{[\s\S]*\})\s*$/);
      if (!match) return tools.turn.settle();
      let input;
      try { input = JSON.parse(match[1]); } catch {}
      if (!valid(input)) return tools.sendMessage('Use relay {"closed":[30],"reserve":8}. Supply map road IDs 0–' +
        (roads - 1) + ' and a whole reserve from 0 to 20.', [{ id: m.senderId }]);
      p = { type: 'start', run: m.id, input };
    } else if (sender && String(m.senderType).toLowerCase() === 'agent') {
      const match = m.content.match(/(?:^|\n)MR1 (\{[^\n]*\})\s*$/);
      try { p = match && JSON.parse(match[1]); } catch {}
    }
    if (!p || typeof p.run !== 'string' || !p.run || p.run.length > 128) return tools.turn.settle();

    const key = JSON.stringify([m.roomId, p.run]);
    const state = store.get(key) ?? {};
    // Preserve the outgoing decision across a failed send or process restart.
    // A duplicate platform delivery can re-send a frame only in the crash window;
    // the receiver also guards each logical transition by phase.
    if (!state.pending) {
      const reply = next(role, sender ?? m.senderId, p, state);
      if (!reply) return tools.turn.settle();
      state.pending = { trigger: m.id, reply };
      store.set(key, state);
    } else if (m.id !== state.pending.trigger) {
      throw new Error('Earlier delivery pending for this simulation. Retry this turn.');
    }
    const { to, content } = state.pending.reply;
    await tools.sendMessage(content, [{ id: Object.hasOwn(ids, to) ? ids[to] : to }]);
    delete state.pending;
    store.set(key, state);
  }
  return turn => {
    const completion = tail.then(() => handle(turn));
    tail = completion.catch(() => {});
    return completion;
  };
}
