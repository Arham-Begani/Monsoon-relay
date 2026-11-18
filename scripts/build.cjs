/* Publish the simulator only. Sponsor credentials and journals live outside this output. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root,'dist');
const files = ['index.html','watch.html','style.css','streets.js','dispatch.js','protocol.js','worker.js','runtime.js','map.js','voice.js','radio.js','impact.js','impact-worker.js','app.js','assets/radio/field-transmission.wav','assets/radio/README.md'];
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
for (const file of files) {
  fs.mkdirSync(path.dirname(path.join(out,file)),{recursive:true});
  fs.copyFileSync(path.join(root,file),path.join(out,file));
}
fs.copyFileSync(path.join(root,'docs','dispatch-preview.png'),path.join(out,'preview.png'));
fs.copyFileSync(path.join(root,'docs','adal','monsoon-relay-demo.mp4'),path.join(out,'walkthrough.mp4'));
console.log('Static simulator built in dist/');
