function createMap(canvas, onSelect) {
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas');
  const layer = base.getContext('2d');
  let scale=1, left=0, top=0, width=0, height=0, pixelRatio=1, state, frame;
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const roads = streets.roads.map(r => r.runs.map(run => run.map(n => streets.nodes[n])));
  const screen = ([x,y]) => [x*scale+left, y*scale+top];
  function line(c, points) {
    c.beginPath();
    points.forEach(([x,y],i) => i ? c.lineTo(x,y) : c.moveTo(x,y));
  }
  function drawBase() {
    base.width = canvas.width; base.height=canvas.height;
    layer.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    layer.fillStyle='#14262c'; layer.fillRect(0,0,width,height);
    layer.translate(left,top); layer.scale(scale,scale);
    const fill = {building:'#21383f',park:'#284b40',water:'#165365',stream:'#285c69'};
    for (const [type, pts] of streets.land) {
      line(layer,pts); layer.fillStyle=fill[type]; layer.strokeStyle=fill[type];
      if (type==='stream') { layer.lineWidth=3; layer.stroke(); }
      else layer.fill();
    }
    for (let priority=0; priority<=2; priority++) {
      streets.roads.forEach((r,i) => {
        if (r.rank!==priority) return;
        for(const pts of roads[i]) {
          line(layer,pts); layer.lineCap='round'; layer.lineWidth=priority===2?6:priority===1?4:2.2;
          layer.strokeStyle=priority===2?'#4e676a':priority===1?'#395760':'#314b53'; layer.stroke();
        }
      });
    }
    layer.setTransform(pixelRatio,0,0,pixelRatio,0,0);
    const labels = [];
    const major=streets.roads.map((r,i)=>({r,i})).filter(({r})=>r.name).sort((a,b)=>b.r.rank-a.r.rank);
    for (const {r,i} of major) {
      if (labels.some(l=>l.name===r.name)) continue;
      const pts=roads[i][0], pt=pts[Math.floor(pts.length/2)], [x,y]=screen(pt);
      if(x<42||x>width-46||y<21||y>height-22 || labels.some(l=>Math.abs(l.x-x)<108 && Math.abs(l.y-y)<36)) continue;
      labels.push({name:r.name,x,y});layer.font='9px monospace';layer.fillStyle='#94aaac';
      layer.textAlign='center';layer.fillText(r.name,x,y);
    }
  }
  function roadStroke(id,color,weight,dash=[]) {
    ctx.strokeStyle=color;ctx.lineWidth=weight;ctx.setLineDash(dash);
    for (const pts of roads[id]) {line(ctx,pts.map(screen));ctx.stroke();}
    ctx.setLineDash([]);
  }
  function pathLine(route,color,active,t) {
    const pts=route.path.map(n=>screen(streets.nodes[n]));
    if(pts.length<2) return;
    line(ctx,pts);ctx.strokeStyle=active?color:'#91a0ad85';ctx.lineWidth=active?4:2;
    ctx.setLineDash(active?[]:[4,6]);ctx.shadowBlur=active?8:0;ctx.shadowColor=color;ctx.stroke();
    ctx.shadowBlur=0;ctx.setLineDash([]);
    if(!active) return;
    const lengths=pts.slice(1).map(([x,y],i)=>Math.hypot(x-pts[i][0],y-pts[i][1]));
    let remain=(t%5200)/5200*lengths.reduce((a,b)=>a+b,0);
    for(let i=0;i<lengths.length;i++) {
      if(remain>lengths[i]){remain-=lengths[i];continue;}
      const f=remain/(lengths[i]||1), [x,y]=pts[i], [u,v]=pts[i+1];
      ctx.fillStyle='#fff';ctx.beginPath();ctx.arc(x+(u-x)*f,y+(v-y)*f,3.4,0,Math.PI*2);ctx.fill();break;
    }
  }
  function marker(node,label,color) {
    const [x,y]=screen(streets.nodes[node]);
    ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.fillStyle=color+'2c';ctx.fill();
    ctx.beginPath();ctx.arc(x,y,5,0,Math.PI*2);ctx.strokeStyle='#14252b';ctx.lineWidth=2;ctx.fillStyle=color;ctx.fill();ctx.stroke();
    ctx.font='bold '+(width<470?'9':'11')+'px sans-serif';
    const w=ctx.measureText(label).width+13;
    const bx=Math.max(2,Math.min(width-w-2,x-w/2));
    ctx.fillStyle='#0e1c23f5';ctx.fillRect(bx,y-28,w,17);ctx.fillStyle=color;ctx.textAlign='center';ctx.fillText(label,bx+w/2,y-16);
  }
  function draw(t=0) {
    if(!state) return;
    ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(base,0,0);
    ctx.setTransform(pixelRatio,0,0,pixelRatio,0,0);ctx.lineCap='round';ctx.lineJoin='round';
    const {plan,closed,selected}=state;
    if(!closed.has(selected)) roadStroke(selected,'#ffb785a6',5,[3,5]);
    pathLine(plan.west,'#8cf1ce',plan.westQty>0,t);
    if(!plan.westQty) pathLine(plan.east,'#81c4ff',plan.eastQty>0,t);
    for(const id of closed) {
      roadStroke(id,'#ff8057',4,[5,4]);
      const pts=roads[id][0], [x,y]=screen(pts[Math.floor(pts.length/2)]);
      ctx.fillStyle='#ff8259';ctx.beginPath();ctx.arc(x,y,8,0,2*Math.PI);ctx.fill();
      ctx.fillStyle='#20292b';ctx.textAlign='center';ctx.font='bold 14px sans-serif';ctx.fillText('×',x,y+4.5);
    }
    marker(scenario.west,'WEST DEPOT','#8cf1ce');marker(scenario.east,'EAST DEPOT','#81c4ff');marker(scenario.shelter,'COMMUNITY HALL','#ffdc9c');
  }
  function animate(t) {
    draw(reducedMotion.matches ? 1300 : t);
    if(!reducedMotion.matches) frame=requestAnimationFrame(animate);
  }
  function restart() { cancelAnimationFrame(frame);frame=requestAnimationFrame(animate); }
  new ResizeObserver(() => {
    const rect=canvas.getBoundingClientRect();width=rect.width;height=rect.height;
    pixelRatio=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(width*pixelRatio);canvas.height=Math.round(height*pixelRatio);
    scale=width/1200;left=0;top=(height-821*scale)/2;
    drawBase();restart();
  }).observe(canvas);
  reducedMotion.addEventListener('change',restart);
  canvas.addEventListener('click',e => {
    const rect=canvas.getBoundingClientRect(),x=e.clientX-rect.left,y=e.clientY-rect.top;
    let dist=13,id=-1;
    roads.forEach((runs,index) => {
      for(const pts of runs) for(let i=1;i<pts.length;i++) {
        const [a,b]=screen(pts[i-1]),[c,d]=screen(pts[i]);const dx=c-a,dy=d-b;
        const f=Math.max(0,Math.min(1,((x-a)*dx+(y-b)*dy)/(dx*dx+dy*dy||1)));
        const hit=Math.hypot(x-a-dx*f,y-b-dy*f);
        if(hit<dist){id=index;dist=hit;}
      }
    });
    if(id>=0) onSelect(id);
  });
  return nextState => {state=nextState;restart();};
}
