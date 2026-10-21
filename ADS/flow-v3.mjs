// Revision 3: a continuous, reversible pose sequence. No cuts, flash frames,
// free-running animations, simulation state, or wall-clock updates.
const gsap=window.gsap;
const tl=gsap.timeline({paused:true});
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=(a,b,x)=>{const q=clamp((x-a)/(b-a));return q*q*q*(q*(q*6-15)+10);};
const W=1080,H=1920;
const canvas=document.getElementById('flow-canvas');
const ctx=canvas.getContext('2d');

// All entrances are masked translation, with continuous acceleration/deceleration.
function arrive(selector,at,y=35,duration=.95,stagger=0){
  tl.fromTo(selector,{opacity:0,y},{opacity:1,y:0,duration,stagger,ease:'power3.out',immediateRender:false},at);
}
function depart(selector,at,y=-24,duration=.65){
  tl.to(selector,{opacity:0,y,duration,ease:'power2.inOut'},at);
}
function headline(id,start,end){
  arrive(`${id} .eyebrow`,start+.1,15,.9);
  arrive(`${id} h2`,start+.14,75,1.15,.1);
  arrive(`${id} .subline`,start+.65,20,.95);
  if(end<32)depart(`${id} .heading-inner`,end-.7,-20,.7);
}
headline('#h-start',0,4);
headline('#h-connect',4,8);
headline('#h-command',8,14);
headline('#h-protocol',14,20);
headline('#h-inspect',20,26);
headline('#h-end',26,32);

tl.fromTo('#object',{opacity:0,y:100,rotationX:12,scale:.94},{opacity:1,y:0,rotationX:0,scale:1,duration:1.6,ease:'power3.out',immediateRender:false},.4);
tl.to('#object',{y:-13,rotationY:-2.5,duration:2,ease:'sine.inOut'},2.0);

// The SAME card becomes a local endpoint, then a terminal, then a logo tile,
// then an inspector. Position, corner radius, and scale share one easing curve.
tl.to('#object',{left:80,top:1090,width:250,height:190,y:0,rotationX:0,rotationY:-8,rotationZ:-4,borderRadius:30,duration:1.45,ease:'power3.inOut'},4.0);
depart('.local-face',4.08,0,.5);
arrive('.mark-face',4.45,0,.65);
arrive('.destination',4.65,35,1.25);
tl.fromTo('.destination',{rotationY:10,rotationX:5},{rotationY:0,rotationX:0,duration:1.4,ease:'power3.out',immediateRender:false},4.65);
arrive('.endpoint-notes',5.5,20,1.0);
tl.to('.destination',{y:-12,duration:1.3,ease:'sine.inOut'},6.5);

tl.to('#object',{left:82,top:820,width:916,height:592,rotationY:0,rotationZ:0,rotationX:0,borderRadius:29,duration:1.4,ease:'power3.inOut'},8.0);
depart('.destination',7.8,0,.65);depart('.endpoint-notes',7.8,-15,.65);
depart('.mark-face',8.1,0,.45);arrive('.terminal-face',8.42,0,.8);
arrive('.command-result',10.65,18,.85);
arrive('.terminal-caption',11.1,20,1.0);
tl.to('#object',{y:-9,rotationY:1.5,duration:1.5,ease:'sine.inOut'},12.0);

tl.to('#object',{left:455,top:826,width:170,height:170,y:0,rotationY:0,rotationZ:0,borderRadius:36,duration:1.5,ease:'power3.inOut'},14.0);
depart('.terminal-face',14.02,0,.52);depart('.terminal-caption',13.8,-15,.7);
arrive('.mark-face',14.65,0,.65);
for(const [i,id]of['#pc-http','#pc-tcp','#pc-udp'].entries()){
  tl.fromTo(id,{opacity:0,x:i%2?-130:130,y:100,rotationX:14,rotationY:i%2?-14:14,rotationZ:i%2?-5:5},
    {opacity:1,x:0,y:0,rotationX:0,rotationY:0,rotationZ:0,duration:1.5,ease:'power3.out',immediateRender:false},14.25+i*.48);
  tl.to(id,{y:-7,rotationY:i%2?1.5:-1.5,duration:1.7,ease:'sine.inOut'},17+i*.16);
  tl.to(id,{opacity:0,x:i%2?90:-90,y:-35,rotationY:i%2?8:-8,duration:.95,ease:'power3.inOut'},19.7+i*.1);
}
arrive('.protocol-note',16.3,15,.9);depart('.protocol-note',19.8,-15,.7);

tl.to('#object',{left:82,top:805,width:916,height:640,y:0,rotationY:0,rotationZ:0,borderRadius:30,duration:1.45,ease:'power3.inOut'},20.0);
depart('.mark-face',20.05,0,.5);arrive('.inspector-face',20.6,0,.8);
arrive('.inspector-row',21.02,20,.8,.18);
arrive('.payload',21.65,15,.8);arrive('.inspector-bottom',22.0,14,.8);
arrive('.inspect-note',22.35,18,.9);
tl.to('.replay',{scale:.95,duration:.17,ease:'power2.inOut'},23.7);
tl.to('.replay',{scale:1,duration:.4,ease:'power3.out'},23.87);
tl.fromTo('.replay-halo',{scale:.85,opacity:.8},{scale:1.5,opacity:0,duration:.8,ease:'power2.out',immediateRender:false},23.85);
tl.to('.inspector-selected',{backgroundColor:'#cfebbd',duration:.6,ease:'sine.inOut'},24.1);

tl.to('#object',{left:425,top:858,width:230,height:230,y:0,rotationY:0,rotationZ:0,borderRadius:49,duration:1.55,ease:'power3.inOut'},26.0);
depart('.inspector-face',26.02,0,.5);depart('.inspect-note',25.75,-15,.7);
arrive('.mark-face',26.65,0,.65);
tl.fromTo('.end-fill',{clipPath:'circle(0% at 50% 50%)'},{clipPath:'circle(120% at 50% 50%)',duration:1.65,ease:'power3.inOut',immediateRender:false},26.0);
tl.to('#object',{borderColor:'#c8ec9c',boxShadow:'0 30px 90px -20px rgba(0,0,0,.2)',duration:1},26.8);
tl.to('#brand',{color:'#e9f3df','--logo-cutout':'#16291d',duration:.9},26.5);
tl.to('.edition',{color:'#bfd2bc',duration:.9},26.5);
tl.to('.progress',{color:'#b1c6ad',duration:.9},26.5);
tl.to('.progress-track i',{backgroundColor:'#bddf9b',duration:.9},26.5);
arrive('.outro-word',27.4,30,1.25);
arrive('.cta',28.05,35,1.1);
arrive('.end-detail',28.55,20,.95);
tl.to('.cta-arrow',{x:5,y:-5,duration:1.2,ease:'sine.inOut',yoyo:true,repeat:1},29.0);
tl.to('#object',{y:-6,duration:2.0,ease:'sine.inOut'},29.9);
tl.fromTo('.progress-track i',{scaleX:0},{scaleX:1,duration:32,ease:'none',immediateRender:false},0);

function point(p,a,b,c,d){const q=1-p;return{x:q*q*q*a.x+3*q*q*p*b.x+3*q*p*p*c.x+p*p*p*d.x,y:q*q*q*a.y+3*q*q*p*b.y+3*q*p*p*c.y+p*p*p*d.y};}
function curve(a,b,c,d,progress,alpha){
  ctx.save();ctx.globalAlpha=alpha;ctx.lineWidth=2.5;ctx.strokeStyle='#8fbc66';ctx.beginPath();
  for(let i=0;i<=90;i++){const p=point(i/90*progress,a,b,c,d);i===0?ctx.moveTo(p.x,p.y):ctx.lineTo(p.x,p.y);}ctx.stroke();ctx.restore();
}
function dot(p,alpha){
  ctx.save();ctx.globalAlpha=alpha;
  const halo=ctx.createRadialGradient(p.x,p.y,0,p.x,p.y,27);halo.addColorStop(0,'#81b94270');halo.addColorStop(1,'#81b94200');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(p.x,p.y,27,0,Math.PI*2);ctx.fill();
  ctx.fillStyle='#2c6028';ctx.beginPath();ctx.arc(p.x,p.y,6,0,Math.PI*2);ctx.fill();ctx.restore();
}
const chapters=['BUILT HERE','SHARED EVERYWHERE','ONE COMMAND','MORE CONNECTIONS','TAKE CONTROL','LET IT OUT'];
function drawAt(t){
  ctx.clearRect(0,0,W,H);
  const bgAlpha=1-smooth(25.8,27.5,t);
  ctx.save();ctx.globalAlpha=.1*bgAlpha;ctx.strokeStyle='#77916b';ctx.lineWidth=1;
  for(let i=0;i<5;i++){ctx.beginPath();ctx.ellipse(540,1130,510+i*70,300+i*45,Math.sin(t*.09)*.12,0,Math.PI*2);ctx.stroke();}ctx.restore();
  const a={x:300,y:1180},b={x:650,y:1520},c={x:720,y:700},d={x:830,y:1030};
  const on=smooth(4.35,5.7,t)*(1-smooth(7.65,8.4,t));
  if(on>0){curve(a,b,c,d,smooth(4.5,6.5,t),on*.8);const p=point(smooth(4.55,6.55,t),a,b,c,d);dot(p,on);}
  if(t>=14&&t<20.7){
    const alpha=smooth(14.4,15.5,t)*(1-smooth(19.5,20.7,t));
    for(let i=0;i<3;i++){
      const start={x:540,y:970},end={x:170,y:1132+i*190};
      const cp1={x:70,y:995},cp2={x:30,y:1132+i*190};
      curve(start,cp1,cp2,end,1,alpha*.35);
      dot(point(((t-14.5)*.35+i*.3)%1,start,cp1,cp2,end),alpha*.8);
    }
  }
  const index=t<4?0:t<8?1:t<14?2:t<20?3:t<26?4:5;
  document.getElementById('progress-label').textContent=`0${index+1} / ${chapters[index]}`;
  document.getElementById('progress-number').textContent=`0${index+1} — 06`;
  document.getElementById('typed-command').textContent='/http 3000'.slice(0,clamp(Math.floor((t-9.2)/.105)+1,0,10));
  document.getElementById('cursor').style.opacity=t>10.55?'0':String(.25+.75*(.5+.5*Math.cos(t*9)));
  document.getElementById('replay-word').textContent=t>=24.25?'Replayed':'Replay';
  document.getElementById('replay-symbol').textContent=t>=24.25?'✓':'↻';
  document.getElementById('capture-status').textContent=t>=24.25?'Replayed locally':t>=23.7?'Replaying…':'Request captured';
}
tl.eventCallback('onUpdate',()=>drawAt(tl.time()));
window.addEventListener('hf-seek',e=>drawAt(e.detail.time));
window.__trqsh={seek(t){tl.seek(clamp(t,0,32),false);drawAt(t);}};
drawAt(0);
export const timeline=tl;
