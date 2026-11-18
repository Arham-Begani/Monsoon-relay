importScripts('streets.js', 'dispatch.js', 'protocol.js');
const transactions = new Map();
self.onmessage = ({data}) => {
  const {runId} = data;
  if (data.type === 'init') {
    if (!transactions.has(runId)) transactions.set(runId, createRelayActor(self.name, data));
    self.postMessage({type: 'ready', runId, route: transactions.get(runId).route});
  } else if (data.type === 'release') {
    transactions.delete(runId);
  } else {
    const reply = transactions.get(runId)?.receive(data);
    if (reply) self.postMessage(reply);
  }
};
