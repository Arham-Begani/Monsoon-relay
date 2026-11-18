import { Agent, GenericAdapter, loadAgentConfigFromEnv } from '@band-ai/sdk';
import { handler, diskStore } from './protocol.mjs';

const roles = ['shelter', 'west', 'east'];
const role = process.argv[2];
if (!roles.includes(role)) throw new Error('Specify shelter, west, or east.');
const ids = Object.fromEntries(roles.map(name => [name, process.env['BAND_' + name.toUpperCase() + '_AGENT_ID']]));
if (Object.values(ids).some(id => !id) || new Set(Object.values(ids)).size !== 3) {
  throw new Error('Configure three distinct BAND agent IDs.');
}
const config = loadAgentConfigFromEnv({ prefix: 'BAND_' + role.toUpperCase() + '_' });
const store = diskStore('.state/' + role);
const handle = handler(role, ids, store);
if (process.env.MONSOON_TRANSPORT === 'rest') {
  const {runRest} = await import('./rest-peer.mjs');
  try {
    await runRest(config, process.env.MONSOON_ROOM_ID, handle, process.env.MONSOON_READY_FILE);
  } catch (error) {
    // Log status only. SDK exceptions can include credential-bearing request details.
    console.error(role + ' REST peer stopped' + (error.statusCode ? ' (HTTP ' + error.statusCode + ')' : '') + '.');
    process.exitCode = 1;
  }
} else {
  await Agent.create({ config, adapter: new GenericAdapter(handle) }).run();
}
