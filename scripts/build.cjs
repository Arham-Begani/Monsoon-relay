/* Publish the simulator only. Sponsor credentials and journals live outside this output. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const out = path.join(root,'dist');
const files = ['index.html','style.css','streets.js','dispatch.js','protocol.js','worker.js','runtime.js','map.js','voice.js','app.js'];
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(out,{recursive:true});
for (const file of files) fs.copyFileSync(path.join(root,file),path.join(out,file));
console.log('Static simulator built in dist/');
