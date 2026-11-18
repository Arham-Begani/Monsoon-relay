importScripts('streets.js', 'dispatch.js', 'impact.js');
self.onmessage = async ({data: {id, ids, reserved}}) => {
  try {
    self.postMessage({id, result: await analyzeRoadImpact(ids, reserved)});
  } catch (error) {
    self.postMessage({id, error: error.message});
  }
};
