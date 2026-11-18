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
await Agent.create({ config, adapter: new GenericAdapter(handler(role, ids, store)) }).run();
