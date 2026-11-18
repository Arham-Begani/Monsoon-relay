import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const roles = {
  shelter: ['Monsoon Shelter', 'Coordinates a simulated flood-relief request for 20 water crates.'],
  west: ['Monsoon West Depot', 'Offers and commits simulated stock from the west depot.'],
  east: ['Monsoon East Depot', 'Offers and commits simulated stock after existing pledges.']
};

export async function provision(dir, post) {
  mkdirSync(dir, {recursive:true, mode:0o700});
  const journal = join(dir, 'provision.json');
  function save(file, content) {
    writeFileSync(file + '.tmp', content, {mode:0o600});
    renameSync(file + '.tmp', file);
  }
  let state = {agents:{}};
  try { state = JSON.parse(readFileSync(journal, 'utf8')); }
  catch (err) { if (err.code !== 'ENOENT') throw err; }
  const persist = () => save(journal, JSON.stringify(state));
  if (state.pending) throw new Error('A prior create has an uncertain result (' + state.pending +
    '). Check the owner console and reconcile the private provision.json before retrying.');
  async function create(label, path, body, record) {
    state.pending = label;
    persist();
    try { record(await post(path, body)); }
    catch (error) {
      if (error.definitive) { delete state.pending; persist(); }
      throw error;
    }
    delete state.pending;
    persist();
  }
  for (const [role,[name,description]] of Object.entries(roles)) {
    if (state.agents[role]) continue;
    await create(role, '/agents/register', {agent:{name,description}}, data => {
      if (!data?.agent?.id || !data?.credentials?.api_key) throw new Error('Incomplete registration response.');
      state.agents[role] = {id:data.agent.id, key:data.credentials.api_key};
    });
  }
  const lines = Object.entries(state.agents).flatMap(([role, agent]) => [
    'BAND_' + role.toUpperCase() + '_AGENT_ID=' + agent.id,
    'BAND_' + role.toUpperCase() + '_API_KEY=' + agent.key
  ]);
  save(join(dir,'peers.env'), lines.join('\n') + '\n');
  if (!state.room) {
    const participants = Object.values(state.agents).map(agent => ({ participant_id:agent.id, role:'member' }));
    await create('room', '/chats', {chat:{title:'Monsoon Relay · Dispatch Test', participants}}, data => {
      if (!data?.id) throw new Error('Incomplete room response.');
      state.room = data.id;
    });
  }
  return state.room;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const dir = process.env.MONSOON_BAND_DIR || join(homedir(), '.config', 'monsoon-relay-band');
  const key = process.env.BAND_USER_KEY || readFileSync(join(dir,'owner.key'), 'utf8').trim();
  if (!key.startsWith('band_u_')) throw new Error('A Band user API key is required.');
  const room = await provision(dir, async (path, body) => {
    const response = await fetch('https://app.band.ai/api/v1/me' + path, {
      method:'POST', redirect:'error',
      headers:{'X-API-Key':key, 'Content-Type':'application/json'},
      body:JSON.stringify(body)
    });
    if (!response.ok) {
      const code = (await response.json().catch(() => ({}))).error?.code;
      const error = new Error('Band returned HTTP ' + response.status + (code ? ' (' + code + ')' : '') + ' for ' + path);
      error.definitive = [400,401,403,404,422,429].includes(response.status);
      throw error;
    }
    return (await response.json()).data;
  });
  console.log('Band room ID:', room);
  console.log('Private peer environment:', join(dir,'peers.env'));
}
