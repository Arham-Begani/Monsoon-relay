const get = id => document.getElementById(id);
const featured = 30;
const runtime = createRelayRuntime();
const roadSelect = get('road'), reserved = get('reserved');
const closed = new Set();
let selected = featured, requestVersion = 0, plan = null, receipt = null, reports = null, radio = null, toastTimer, replayTimer;
const roadsByLabel = streets.roads.map((road,id) => ({id,label:road.label}))
  .sort((a,b) => a.label.localeCompare(b.label,'en',{numeric:true}));
const westPath = findRoute(scenario.west,new Set()).path;
const routeRoads = new Set(westPath.slice(1).map((node,i) => graph[westPath[i]].find(edge => edge.to === node).roadId));
for (const [title,onRoute] of [['Original west supply route',true],['Other mapped roads',false]]) {
  const group = document.createElement('optgroup');
  group.label = title;
  for (const road of roadsByLabel) {
    if (routeRoads.has(road.id) === onRoute) group.append(new Option(road.label,road.id));
  }
  roadSelect.append(group);
}
function readScenario(hash) {
  if (!hash) return {roads:[],reserve:8,pick:featured};
  const params = new URLSearchParams(hash.slice(1));
  const number = (s,max) => s !== null && /^\d{1,3}$/.test(s) && Number(s)<=max;
  const ids = (params.get('roads') || '').split(',').filter(Boolean);
  const valid = params.get('v') === '1' && ids.every(id => number(id,streets.roads.length-1))
    && number(params.get('reserve'),20) && number(params.get('pick'),streets.roads.length-1);
  if (!valid) return null;
  return {roads:[...new Set(ids.map(Number))],reserve:Number(params.get('reserve')),pick:Number(params.get('pick'))};
}
function scenarioUrl() {
  const url = new URL(location.href);
  url.hash = new URLSearchParams({v:'1',roads:[...closed].sort((a,b)=>a-b).join(','),reserve:reserved.value,pick:String(selected)});
  return url.href;
}
function notify(text) {
  clearTimeout(toastTimer);
  get('session-status').textContent = text;
  toastTimer = setTimeout(() => { get('session-status').textContent = ''; },4500);
}
function selectRoad(id) {
  selected = id;
  roadSelect.value = String(id);
  const isClosed = closed.has(id);
  get('toggle').textContent = isClosed ? 'Reopen road' : 'Close road';
  get('toggle').classList.toggle('reopen',isClosed);
  if (plan) paint({plan,closed,selected});
}
function manualSelect(id) { radio?.reset(); reports?.reset(); selectRoad(id); }
const paint = createMap(get('map'),manualSelect);
function makeReceipt(result,held) {
  const eta = value => Number.isFinite(value) ? value : null;
  return {
    version:1, scenario:'Halasuru water dispatch', run:result.runId,
    transport:result.mode === 'workers' ? 'Three browser Web Workers' : 'Three local in-process actors',
    deadlineMinutes:scenario.deadline, requestedCrates:scenario.target,
    closures:[...closed].sort((a,b)=>a-b).map(id=>({id,section:streets.roads[id].label})),
    schoolShelterPickupReserved:held,
    west:{stock:20,vanCapacity:20,etaMinutes:eta(result.west.minutes),committed:result.westQty},
    east:{stock:20,available:20-held,vanCapacity:16,etaMinutes:eta(result.east.minutes),committed:result.eastQty},
    westAloneOnTime:result.baseline, coordinatedOnTime:result.total, outstanding:result.gap,
    messages:result.trace
  };
}
function drawResult(held) {
  get('total').textContent = plan.total;
  get('gap').textContent = plan.gap;
  get('gap').classList.toggle('gap',plan.gap>0);
  get('gain').textContent = plan.total-plan.baseline;
  get('bars').replaceChildren(...Array.from({length:scenario.target},(_,i)=>{
    const bar=document.createElement('i');
    bar.className=i<plan.westQty?'west':i<plan.total?'east':'missing';
    return bar;
  }));
  get('depots').replaceChildren(...['west','east'].map(team=>{
    const line=document.createElement('div');line.className='depot';
    const dot=document.createElement('i');dot.className=team;
    const title=document.createElement('div');title.append(team==='west'?'West depot':'East depot');
    const eta=plan[team].minutes;
    const detail=document.createElement('small');
    detail.textContent=Number.isFinite(eta)?eta+' min · '+(eta>scenario.deadline?'past deadline':'within deadline'):'No open route';
    title.append(detail);
    const total=document.createElement('strong');total.textContent=plan[team+'Qty']+' crates';
    line.append(dot,title,total);return line;
  }));
  get('messages').replaceChildren(...plan.messages.map(message=>{
    const li=document.createElement('li'), sender=document.createElement('b');
    sender.textContent=message.from;
    li.append(sender,document.createTextNode(message.text));return li;
  }));
  const kpis=get('kpis');
  kpis.classList.remove('stateflash');void kpis.offsetWidth;kpis.classList.add('stateflash');
  receipt=makeReceipt(plan,held);
  if(get('receipt-dialog').open) showReceipt();
  selectRoad(selected);
}
function speakResult() {
  if(!get('speak-result').checked || !window.speechSynthesis || !plan)return;
  const hindi=get('language').value==='hi-IN';
  const text=hindi ? plan.total+' बक्से समय पर पहुँचने का वादा है। '+plan.gap+' बक्से अभी बाकी हैं।' :
    plan.total+' crates committed before the deadline. '+plan.gap+' still outstanding.';
  const utterance=new SpeechSynthesisUtterance(text);utterance.lang=get('language').value;
  speechSynthesis.cancel();speechSynthesis.speak(utterance);
}
function stopReplay() {
  clearTimeout(replayTimer);replayTimer=null;
  get('messages').querySelectorAll('.current').forEach(node=>node.classList.remove('current'));
  get('replay').textContent='Replay';
}
get('replay').addEventListener('click',()=>{
  if(replayTimer){stopReplay();return;}
  if(!plan)return;
  let step=0;
  get('replay').textContent='Stop';
  function advance(){
    const lines=[...get('messages').children];
    lines.forEach((line,i)=>line.classList.toggle('current',i===step));
    if(step>=lines.length){stopReplay();return;}
    const current=lines[step++];
    const list=get('messages');
    list.scrollTop+=Math.max(0,current.getBoundingClientRect().bottom-list.getBoundingClientRect().bottom);
    replayTimer=setTimeout(advance,1000);
  }
  get('messages').scrollTop=0;
  advance();
});
async function update(readBack=false) {
  stopReplay();
  const version=++requestVersion;
  const held=Number(reserved.value);
  get('held').textContent=held+' crates';
  get('closed-count').textContent=closed.size+' '+(closed.size===1?'road':'roads')+' closed';
  get('evidence').disabled=true;
  get('kpis').setAttribute('aria-busy','true');
  try {
    const next=await runtime.run(new Set(closed),held);
    if(version!==requestVersion)return;
    plan=next;drawResult(held);get('evidence').disabled=false;
    if(readBack)speakResult();
  } catch {
    if(version===requestVersion){plan=null;receipt=null;get('total').textContent='—';get('gap').textContent='—';notify('Dispatch interrupted. Reset the scenario to retry.');}
  } finally {if(version===requestVersion)get('kpis').removeAttribute('aria-busy');}
}
function setClosure(id,isClosed) {
  if(isClosed) closed.add(id);else closed.delete(id);
  selected=id;roadSelect.value=String(id);
  update(true);
}
roadSelect.addEventListener('change',()=>manualSelect(Number(roadSelect.value)));
get('toggle').addEventListener('click',()=>{
  radio?.reset();reports.reset();
  const isClosed=!closed.has(selected);
  setClosure(selected,isClosed);
  get('voice-msg').textContent=streets.roads[selected].label+(isClosed?' closed.':' reopened.');
});
reserved.addEventListener('input',()=>update());
function loadScenario(input) {
  radio?.reset();reports?.reset();closed.clear();
  for(const road of input.roads)closed.add(road);
  reserved.value=input.reserve;selected=input.pick;roadSelect.value=String(selected);
  update();
}
get('reset').addEventListener('click',()=>{
  if(location.hash)history.replaceState(null,'',location.href.split('#')[0]);
  window.speechSynthesis?.cancel();
  get('report-text').value='';loadScenario(readScenario(''));
});
function readLocation() {
  const input=readScenario(location.hash);
  loadScenario(input || readScenario(''));
  if(!input)notify('Invalid scenario link. Showing the original dispatch.');
}
window.addEventListener('hashchange',readLocation);
reports=installFieldReports({
  roads:streets.roads,getSelected:()=>selected,isClosed:id=>closed.has(id),
  selectRoad,applyReport:setClosure,announce:text=>{get('voice-msg').textContent=text;}
});
radio=installRadioIntake({onStart:()=>reports.reset(),onTranscript:text=>{
  get('voice-options').open=true;
  get('report-text').value=text;
  get('parse-report').click();
},announce:text=>{get('radio-status').textContent=text;}});
get('mic').addEventListener('click',()=>{radio.reset();get('voice-options').open=true;});
get('report-text').addEventListener('input',()=>radio.reset());
get('parse-report').addEventListener('click',()=>radio.reset());
function showReceipt(){get('receipt-body').textContent=JSON.stringify(receipt,null,2);}
get('evidence').addEventListener('click',()=>{if(receipt){showReceipt();get('receipt-dialog').showModal();}});
get('receipt-close').addEventListener('click',()=>get('receipt-dialog').close());
async function copyText(value,label) {
  try {
    await navigator.clipboard.writeText(value);
    notify(label+' copied.');
  } catch {
    const dlg=get('receipt-dialog');if(!dlg.open)dlg.showModal();
    get('receipt-body').textContent=value;
    const range=document.createRange();range.selectNodeContents(get('receipt-body'));
    const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
    notify('Select and copy the highlighted '+label.toLowerCase()+'.');
  }
}
get('copy-receipt').addEventListener('click',()=>{if(receipt)copyText(JSON.stringify(receipt,null,2),'Run receipt');});
get('band-command').addEventListener('click',()=>copyText('relay '+JSON.stringify({closed:[...closed].sort((a,b)=>a-b),reserve:Number(reserved.value)}),'BAND command'));
get('share').addEventListener('click',()=>copyText(scenarioUrl(),'Scenario link'));
readLocation();
let impactAnalyzer, impactVersion=0;
const impactDialog=get('impact-dialog');
get('impact-close').addEventListener('click',()=>impactDialog.close());
impactDialog.addEventListener('close',()=>{impactVersion++;impactAnalyzer?.close();impactAnalyzer=null;});
get('impact-open').addEventListener('click',async ()=>{
  const myVersion=++impactVersion;
  get('impact-results').replaceChildren();
  get('impact-summary').textContent='Calculating routes and commitments…';
  impactDialog.showModal();
  impactAnalyzer=createImpactAnalyzer();
  try{
    const result=await impactAnalyzer.run(new Set(closed),Number(reserved.value));
    if(myVersion!==impactVersion)return;
    get('impact-summary').textContent=result.tested+' road sections tested · '+result.handoffs+' depot handoffs · '+result.losses+' reduced on-time supply';
    if(!result.tested)return;
    const label=document.createElement('label');
    label.textContent='Explore a section, ranked by supply loss and route delay';
    label.htmlFor='impact-road';
    const select=document.createElement('select');select.id='impact-road';
    for(const row of result.rows)select.add(new Option(streets.roads[row.id].label,row.id));
    const detail=document.createElement('p');detail.className='impact-detail';
    const apply=document.createElement('button');apply.textContent='Apply this closure';apply.type='button';
    function show(){
      const row=result.rows[select.selectedIndex];
      const minutes=x=>Number.isFinite(x)?x+' min':'unreachable';
      detail.textContent='West ETA '+minutes(row.westMinutes)+' · East ETA '+minutes(row.eastMinutes)+'. '+
        row.total+' of 20 crates pledged on time ('+row.westQty+' west, '+row.eastQty+' east). '+row.gap+' outstanding.';
    }
    select.addEventListener('change',show);show();
    apply.addEventListener('click',()=>{
      const id=Number(select.value);impactDialog.close();manualSelect(id);setClosure(id,true);
      get('voice-msg').textContent=streets.roads[id].label+' closed after stress test.';
    });
    get('impact-results').append(label,select,detail,apply);
  }catch{if(myVersion===impactVersion)get('impact-summary').textContent='Analysis interrupted. Reopen the stress test to run it again.';}
});
