const get = id => document.getElementById(id);
const closed = new Set();
const featured = 30;
let selected = featured, plan, recognition;
const roadSelect=get('road'), reserved=get('reserved'), voiceMessage=get('voice-msg');
const roadsByLabel=streets.roads.map((r,i)=>({label:r.label,i})).sort((a,b)=>a.label.localeCompare(b.label,undefined,{numeric:true}));
const initialPath=findRoute(scenario.west,new Set()).path;
const originalRoads=new Set();
for(let i=1;i<initialPath.length;i++) {
  const edge=graph[initialPath[i-1]].find(e=>e.to===initialPath[i]);
  originalRoads.add(edge.roadId);
}
for(const [label,inRoute] of [['Original west supply route',true],['Other mapped roads',false]]) {
  const group=document.createElement('optgroup');group.label=label;
  for(const road of roadsByLabel) {
    if(originalRoads.has(road.i)===inRoute) group.append(new Option(road.label,road.i));
  }
  roadSelect.append(group);
}
const paint=createMap(get('map'), selectRoad);
function selectRoad(id) {
  selected=id; roadSelect.value=String(id);
  const isClosed=closed.has(id);get('toggle').textContent=isClosed?'Reopen road':'Close road';
  get('toggle').classList.toggle('reopen',isClosed);
  paint({plan,closed,selected});
}
function update() {
  const held=Number(reserved.value);plan=dispatch(closed,held);
  get('held').textContent=held+' crates';
  get('total').textContent=plan.total;get('gap').textContent=plan.gap;
  get('gap').classList.toggle('gap',plan.gap>0);
  get('closed-count').textContent=closed.size+' '+(closed.size===1?'road':'roads')+' closed';
  get('bars').replaceChildren(...Array.from({length:scenario.target},(_,i)=>{
    const cell=document.createElement('i');cell.className=i<plan.westQty?'west':i<plan.total?'east':'missing';return cell;
  }));
  get('depots').replaceChildren(...['west','east'].map(team=>{
    const line=document.createElement('div');line.className='depot';
    const dot=document.createElement('i');dot.className=team;
    const text=document.createElement('div');text.append((team==='west'?'West':'East')+' depot');
    const detail=document.createElement('small'), eta=plan[team].minutes;
    detail.textContent=Number.isFinite(eta)?eta+' min to shelter · van fits '+(team==='west'?20:16):'No open route';
    text.append(detail);const total=document.createElement('strong');total.textContent=plan[team+'Qty']+' crates';
    line.append(dot,text,total);return line;
  }));
  get('messages').replaceChildren(...plan.messages.map(m=>{
    const li=document.createElement('li'),name=document.createElement('b');name.textContent=m.from;
    li.append(name,document.createTextNode(m.text));return li;
  }));
  get('kpis').classList.remove('stateflash');void get('kpis').offsetWidth;get('kpis').classList.add('stateflash');
  selectRoad(selected);
}
roadSelect.addEventListener('change',()=>{voiceMessage.textContent='';selectRoad(Number(roadSelect.value));});
get('toggle').addEventListener('click',()=>{
  if(closed.has(selected))closed.delete(selected);else closed.add(selected);
  voiceMessage.textContent=streets.roads[selected].label+(closed.has(selected)?' closed.':' reopened.');update();
});
reserved.addEventListener('input',update);
get('reset').addEventListener('click',()=>{
  recognition?.abort();closed.clear();selected=featured;reserved.value=8;voiceMessage.textContent='';update();
});
const speechApi=window.SpeechRecognition||window.webkitSpeechRecognition;
function normalise(t){return t.toLocaleLowerCase().replace(/[^\p{L}\p{M}\p{N}\s]/gu,' ').replace(/\s+/g,' ').trim();}
function hear(transcript) {
  const said=normalise(transcript);
  const names=[...new Set(streets.roads.map(r=>r.name).filter(Boolean))];
  const matches=names.filter(n=>said.includes(normalise(n))).sort((a,b)=>b.length-a.length);
  let selectedByVoice=false;
  if(matches.length) {
    const options=roadsByLabel.filter(o=>streets.roads[o.i].name===matches[0]);
    if(options.length===1) {selectRoad(options[0].i);selectedByVoice=true;}
    else if(streets.roads[selected].name===matches[0]) selectedByVoice=true;
    else {voiceMessage.textContent='Heard “'+transcript+'”. Pick the intended section of '+matches[0]+' and confirm.';return;}
  }
  voiceMessage.textContent='Heard “'+transcript+'”. '+(selectedByVoice?'Review ':'Pick or review ')+streets.roads[selected].label+', then confirm using the road button.';
}
if(!speechApi) {
  get('mic').disabled=true;voiceMessage.textContent='Voice unavailable in this browser. Use the road selector.';
} else {
  get('mic').addEventListener('click',()=>{
    const session=new speechApi(); recognition=session;session.lang=get('language').value;
    session.interimResults=false;session.continuous=false;
    session.onresult=e=>hear(e.results[0][0].transcript);
    session.onerror=e=>{if(e.error!=='aborted')voiceMessage.textContent='Voice unavailable ('+e.error+'). Select the road and confirm.';};
    session.onend=()=>{get('mic').disabled=false;get('mic').textContent='◉ Voice report';};
    try{
      session.start();get('mic').disabled=true;get('mic').textContent='Listening…';voiceMessage.textContent='Name the road, or report on the selected section.';
    }catch{voiceMessage.textContent='Microphone unavailable. Select the road and confirm.';}
  });
}
update();
