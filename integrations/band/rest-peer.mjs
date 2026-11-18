import { BandClient } from '@band-ai/rest-client';
import { FernRestAdapter } from '@band-ai/sdk/rest';
import { setTimeout as sleep } from 'node:timers/promises';
import { writeFileSync } from 'node:fs';

const options = { maxRetries: 0, timeoutInSeconds: 15 };

export function roomApi(config, fetchImpl = globalThis.fetch) {
  const client = new BandClient({apiKey: config.apiKey, baseUrl: 'https://app.band.ai', fetch: fetchImpl});
  const rest = new FernRestAdapter(client);
  return {
    async authenticate(room) {
      const me = await rest.getAgentMe(options);
      if (me.id !== config.agentId) throw new Error('Configured agent identity does not match its key.');
      await rest.getChat(room, options);
    },
    async next(room) {
      // The generated client preserves optional inserted_at and metadata. 204 is empty.
      return (await client.agentApiMessages.getAgentNextMessage(room, options))?.data ?? null;
    },
    processing: (room,id) => rest.markMessageProcessing(room,id,options),
    processed: (room,id) => rest.markMessageProcessed(room,id,options),
    failed: (room,id) => rest.markMessageFailed(room,id,'Relay could not complete this delivery.',options),
    send: (room,content,mentions) => rest.createChatMessage(room,{content,mentions},options)
  };
}

export async function drainOne(api, room, handle) {
  const row = await api.next(room);
  if (!row) return false;
  if (!row.id || (row.chat_room_id && row.chat_room_id !== room)) throw new Error('Invalid room delivery.');
  await api.processing(room,row.id);
  try {
    if (row.message_type === 'text') {
      await handle({ message: {
        roomId:room, id:row.id, content:row.content, senderId:row.sender_id,
        senderType:row.sender_type, senderName:row.sender_name ?? null,
        messageType:row.message_type, metadata:row.metadata ?? {}
      }, tools: {
        sendMessage: (content, mentions) => api.send(room,content,mentions),
        turn: { settle() {} }
      }});
    }
  } catch (error) {
    await api.failed(room,row.id);
    throw error;
  }
  await api.processed(room,row.id);
  return true;
}

export async function runRest(config, room, handle, readyFile) {
  if (!room) throw new Error('A dedicated Band room ID is required.');
  const api = roomApi(config);
  await api.authenticate(room);
  if (readyFile) writeFileSync(readyFile, 'ready', {mode:0o600, flag:'wx'});
  let failures = 0;
  for (;;) {
    try {
      const delivered = await drainOne(api,room,handle);
      failures = 0;
      await sleep(delivered ? 180 : 1800);
    } catch (error) {
      const status = Number(error.statusCode ?? error.status);
      failures++;
      if ([401,403,404].includes(status) || failures >= 6) {
        throw new Error('Band REST delivery stopped after ' + failures + ' failure(s)' +
          (status ? ' (HTTP ' + status + ').' : '.'));
      }
      console.error('Band REST delivery retry ' + failures + (status ? ' (HTTP ' + status + ')' : ''));
      await sleep(Math.min(30000, 2000 * 2 ** (failures - 1)));
    }
  }
}
