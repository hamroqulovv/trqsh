import * as THREE from './assets/vendor/three.module.js';

// Every visual state is a pure function of Hyperframes' timeline time.
// No wall-clock animation, external assets, or accumulated simulation state.
const DURATION = 32;
const gsap = window.gsap;
const clamp = (x, a=0, b=1) => Math.max(a, Math.min(b, x));
const smooth = (a,b,x) => { const p=clamp((x-a)/(b-a)); return p*p*(3-2*p); };
const lerp = (a,b,p) => a+(b-a)*p;
const root = document.getElementById('film');
const canvas = document.getElementById('world');
const renderer = new THREE.WebGLRenderer({canvas, alpha:true, antialias:true, preserveDrawingBuffer:true, powerPreference:'high-performance'});
renderer.setPixelRatio(1);
renderer.setSize(1080,1920,false);
renderer.setClearColor(0x080a0c,0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38,1080/1920,.1,150);
camera.position.set(0,.6,17);
scene.add(new THREE.HemisphereLight(0xe9f0f5,0x11171d,2.1));
const key = new THREE.DirectionalLight(0xffffff,6);
key.position.set(-4,7,8); scene.add(key);
const rim = new THREE.DirectionalLight(0xd8e5f2,4.5);
rim.position.set(6,-1,-2);scene.add(rim);
const warm = new THREE.PointLight(0xf2e7ca,38,24,2);
warm.position.set(-4,-2,4);scene.add(warm);

// An original studio reflection map supplies long photographic strip highlights.
const environmentCanvas = document.createElement('canvas');
environmentCanvas.width=1024; environmentCanvas.height=512;
const ec=environmentCanvas.getContext('2d');
const grad=ec.createLinearGradient(0,0,0,512);
grad.addColorStop(0,'#252b33');grad.addColorStop(.46,'#101418');grad.addColorStop(.53,'#595e63');grad.addColorStop(1,'#0a0e13');
ec.fillStyle=grad;ec.fillRect(0,0,1024,512);
for(const [x,w,opacity] of [[48,130,.95],[310,22,.8],[550,215,.75],[860,31,1]]){
  const strip=ec.createLinearGradient(x,0,x+w,0);
  strip.addColorStop(0,'rgba(255,255,255,0)');strip.addColorStop(.2,`rgba(245,244,235,${opacity})`);strip.addColorStop(.75,`rgba(242,247,255,${opacity})`);strip.addColorStop(1,'rgba(255,255,255,0)');
  ec.fillStyle=strip;ec.fillRect(x,48,w,366);
}
const envTexture=new THREE.CanvasTexture(environmentCanvas);
envTexture.mapping=THREE.EquirectangularReflectionMapping;
envTexture.colorSpace=THREE.SRGBColorSpace;
const pmrem=new THREE.PMREMGenerator(renderer);
scene.environment=pmrem.fromEquirectangular(envTexture).texture;

const portal=new THREE.Group();scene.add(portal);
const metal=new THREE.MeshStandardMaterial({color:0xced1d3,metalness:1,roughness:.21,envMapIntensity:2.5});
const darkMetal=new THREE.MeshStandardMaterial({color:0x555c64,metalness:1,roughness:.27,envMapIntensity:2.3});
const rings=[];
for(let i=0;i<17;i++){
  const ring=new THREE.Mesh(new THREE.TorusGeometry(2.48-i*.025, i===0?.13:.038+(i%3)*.014,14,192),i%4===0?darkMetal:metal);
  ring.position.z=-i*.24;
  portal.add(ring);rings.push(ring);
}
const edgeMaterial=new THREE.MeshBasicMaterial({color:0xe7e8de,transparent:true,opacity:.78});
const outerEdge=new THREE.Mesh(new THREE.TorusGeometry(2.64,.009,6,192),edgeMaterial);
portal.add(outerEdge);
const segments=[];
for(let i=0;i<7;i++){
  const m=new THREE.MeshBasicMaterial({color:i%2?0xc6d1d9:0xf9f0d4,transparent:true,opacity:.9});
  const arc=new THREE.Mesh(new THREE.TorusGeometry(2.49-i*.025,.013,6,80,Math.PI*.23),m);
  arc.position.z=-i*.42+.04;portal.add(arc);segments.push(arc);
}
const innerHalo=new THREE.Mesh(new THREE.TorusGeometry(2.1,.018,8,160),new THREE.MeshBasicMaterial({color:0xc1c7c4,transparent:true,opacity:.5}));
innerHalo.position.z=-4.8;portal.add(innerHalo);

// Particles are sampled from a fixed low-discrepancy sequence.
const particleCount=150;
const positions=new Float32Array(particleCount*3);
const seeds=[];
for(let i=0;i<particleCount;i++) seeds.push({angle:i*2.39996323,r:2.1+((i*73)%101)/101*1.1,z:((i*37)%109)/109});
const particlesGeo=new THREE.BufferGeometry();particlesGeo.setAttribute('position',new THREE.BufferAttribute(positions,3));
const particlesMat=new THREE.PointsMaterial({color:0xe6e9d8,size:.027,transparent:true,opacity:.7,blending:THREE.AdditiveBlending,depthWrite:false});
const particles=new THREE.Points(particlesGeo,particlesMat);portal.add(particles);

const globe=new THREE.Group();scene.add(globe);
const gridMat=new THREE.LineBasicMaterial({color:0x9faeac,transparent:true,opacity:.25});
const globeRadius=1.78;
for(let j=-3;j<=3;j++){
  const lat=j*Math.PI/9;
  const y=Math.sin(lat)*globeRadius;
  const radius=Math.cos(lat)*globeRadius;
  const points=[];
  for(let i=0;i<=128;i++){const a=i/128*Math.PI*2;points.push(new THREE.Vector3(Math.cos(a)*radius,y,Math.sin(a)*radius));}
  globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),gridMat));
}
for(let j=0;j<12;j++){
  const a=j*Math.PI/12;const points=[];
  for(let i=0;i<=128;i++){const b=i/128*Math.PI*2;points.push(new THREE.Vector3(Math.cos(b)*Math.cos(a)*globeRadius,Math.sin(b)*globeRadius,Math.cos(b)*Math.sin(a)*globeRadius));}
  globe.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points),gridMat));
}
const sphere=new THREE.Mesh(new THREE.SphereGeometry(globeRadius*.997,48,32),new THREE.MeshBasicMaterial({color:0x0c1115,transparent:true,opacity:.9}));
globe.add(sphere);
const routes=[],beacons=[];
const nodeMaterial=new THREE.MeshBasicMaterial({color:0xf0eddc});
for(let i=0;i<13;i++){
  const y=1-2*(i+.5)/13;const angle=i*2.39996323;
  const r=Math.sqrt(1-y*y);
  const pos=new THREE.Vector3(Math.cos(angle)*r,y,Math.sin(angle)*r).multiplyScalar(globeRadius*1.008);
  const node=new THREE.Mesh(new THREE.SphereGeometry(.035,8,6),nodeMaterial);node.position.copy(pos);globe.add(node);
  if(i<10){
    const start=new THREE.Vector3(-1.35,.4,1.1).normalize().multiplyScalar(globeRadius*1.01);
    const mid=start.clone().add(pos).normalize().multiplyScalar(globeRadius*(1.2+(i%3)*.15));
    const curve=new THREE.QuadraticBezierCurve3(start,mid,pos);
    const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(curve.getPoints(70)),new THREE.LineBasicMaterial({color:i%3?0xe7e4d2:0xabc3d3,transparent:true,opacity:.6}));
    globe.add(line);routes.push(curve);
    const b=new THREE.Mesh(new THREE.SphereGeometry(.052,8,6),nodeMaterial);globe.add(b);beacons.push(b);
  }
}

const tl=gsap.timeline({paused:true});
const labels=['THE IDEA','THE WAY OUT','ONE COMMAND','THE CONNECTION','IN CONTROL','UNLEASHED'];
const boundaries=[0,4,8,14,20,26];
const chapter=document.getElementById('chapter-text');
const chapterCount=document.getElementById('chapter-count');

function entrance(selector,at,{y=65,duration=.75,stagger=.08,scale=1,blur=0}={}){
  tl.fromTo(selector,{opacity:0,y,scale,filter:`blur(${blur}px)`},{opacity:1,y:0,scale:1,filter:'blur(0px)',duration,stagger,ease:'power3.out',immediateRender:false},at);
}
function exit(selector,at,{y=-45,duration=.4,blur=5}={}){
  tl.to(selector,{opacity:0,y,filter:`blur(${blur}px)`,duration,ease:'power2.in'},at);
}

entrance('#intro .eyebrow',.16,{y:15,duration:1});
entrance('#intro h1',.25,{y:145,duration:.95,stagger:.14,blur:3});
entrance('.intro-sub',1.05,{y:30,duration:.9});
entrance('.local-pill',1.45,{y:25,duration:1.0,scale:.96});
entrance('.intro-coordinate',2.0,{y:10,duration:.9});
tl.to('.local-pill',{borderColor:'#c8c6b9',boxShadow:'0 0 45px rgba(228,233,205,.13)',duration:.8},2.8);
exit('#intro .scene-inner',3.62,{y:-55,duration:.38});

entrance('#reveal .eyebrow',4.15,{y:15,duration:.8});
entrance('.hero-word',4.08,{y:85,duration:1.0,scale:.9,blur:12});
entrance('.reveal-sub span',4.65,{y:27,duration:.8});
entrance('.reveal-sub strong',4.87,{y:27,duration:.8});
entrance('.signal-label',5.35,{y:14,duration:.7});
tl.to('.hero-word',{y:-9,duration:2.0,ease:'sine.inOut'},5.6);
exit('#reveal .scene-inner',7.62,{y:-55,duration:.38});

entrance('#command .eyebrow',8.15,{y:15});
entrance('.command-title h2',8.12,{y:140,duration:.82,stagger:.11});
entrance('.terminal',8.4,{y:100,duration:1.0,scale:.9,blur:3});
tl.fromTo('.terminal',{rotationX:8,rotationY:-5},{rotationX:0,rotationY:0,duration:1.3,ease:'power2.out',immediateRender:false},8.4);
entrance('.terminal-output',10.42,{y:18,duration:.7});
entrance('.terminal-connection',10.45,{y:0,duration:.35});
entrance('.endpoint-path',10.7,{y:15,duration:.7});
tl.fromTo('.path-line i',{x:-80},{x:400,duration:1.7,ease:'power1.inOut',repeat:1,immediateRender:false},10.7);
entrance('.command-note',11.0,{y:24,duration:.8});
entrance('.example-label',11.7,{y:8,duration:.6});
tl.to('.terminal',{y:-12,scale:1.01,duration:2,ease:'sine.inOut'},11.5);
exit('#command .scene-inner',13.65,{y:-70,duration:.35});

entrance('#protocols .eyebrow',14.1,{y:15});
for(let i=0;i<3;i++){
  entrance(`.protocol-line:nth-child(${i+1})`,14.35+i*.8,{y:110,duration:.7,blur:4});
  tl.fromTo(`.protocol-line:nth-child(${i+1}) i`,{x:-20,opacity:0},{x:0,opacity:1,duration:.7,immediateRender:false},14.6+i*.8);
}
entrance('.globe-label',16.9,{y:12,duration:.8});
entrance('.protocol-note strong',17.2,{y:22,duration:.7});
entrance('.protocol-note>span',17.45,{y:18,duration:.7});
exit('#protocols .scene-inner',19.65,{y:-60,duration:.35});

entrance('#inspector .eyebrow',20.13,{y:15});
entrance('.inspector-title h2',20.1,{y:150,duration:.8,stagger:.1});
entrance('.inspector-panel',20.4,{y:110,scale:.95,duration:.9,blur:4});
entrance('.request-row',21.0,{y:25,duration:.5,stagger:.22});
entrance('.response',21.8,{y:15,duration:.6});
entrance('.replay-bar',22.05,{y:15,duration:.6});
tl.to('.selected',{backgroundColor:'rgba(223,235,204,.13)',duration:.35},23.4);
tl.to('.replay-button',{scale:.94,duration:.12,ease:'power2.in'},23.7);
tl.to('.replay-button',{scale:1,duration:.38,ease:'back.out(1.8)'},23.82);
tl.fromTo('.replay-ring',{scale:.7,opacity:.9},{scale:1.35,opacity:0,duration:.7,immediateRender:false},23.82);
entrance('.inspector-note',22.4,{y:22,duration:.7});
entrance('.inspector-example',23.0,{y:8,duration:.6});
exit('#inspector .scene-inner',25.65,{y:-55,duration:.35});

tl.fromTo('.outro-background',{y:1920},{y:0,duration:.6,ease:'power4.inOut',immediateRender:false},26);
entrance('#outro .eyebrow',26.5,{y:18,duration:.7});
entrance('.outro-title h2',26.5,{y:150,duration:.95,stagger:.13});
entrance('.outro-mark',27.1,{y:40,scale:.91,duration:.95,blur:6});
entrance('.cta',27.8,{y:55,duration:.8,scale:.98});
entrance('.outro-detail',28.3,{y:18,duration:.7});
entrance('.install',28.65,{y:15,duration:.7});
tl.fromTo('.outro-orbit',{scale:.8,opacity:0},{scale:1.05,opacity:1,duration:5.5,stagger:.15,ease:'power2.out',immediateRender:false},26.5);
tl.to('.cta-arrow',{x:7,y:-7,duration:1.2,ease:'sine.inOut',yoyo:true,repeat:1},29);
tl.fromTo('.chapter-line i',{scaleX:0},{scaleX:1,duration:32,ease:'none',immediateRender:false},0);

for(const at of [4,8,14,20]){
  tl.fromTo('#flash',{opacity:.15},{opacity:0,duration:.22,ease:'power2.out',immediateRender:false},at);
}
tl.to('#brand',{color:'#161a19',duration:.2},26.33);
tl.to('#edition',{color:'#606a65',duration:.2},26.33);
tl.to('#chapter',{color:'#536157',duration:.2},26.33);
tl.to('.chapter-line i',{backgroundColor:'#28322b',duration:.2},26.33);
tl.to('#brand',{'--brand-cutout':'#ecebe6',duration:.2},26.33);
tl.to('.grain',{opacity:.025,duration:.4},26.1);
tl.to('.outro-mark',{y:-7,duration:2.3,ease:'sine.inOut'},29.1);

function renderWorld(t){
  const reveal=smooth(3.35,5.25,t);
  const recede=smooth(7.7,9.6,t);
  const isGlobe=t>=14 && t<20;
  portal.visible=t<26 && !isGlobe;
  globe.visible=isGlobe;
  const cameraZ=lerp(17.9,15.6,reveal)+recede*3;
  camera.position.set(lerp(1.55,.4,reveal)+Math.sin(t*.25)*.18,.55,cameraZ);
  camera.lookAt(0,-.2,0);
  portal.position.set(0,lerp(-1.55,-2.1,reveal)-recede*1.2,-recede*5);
  portal.rotation.set(.12+Math.sin(t*.3)*.09,lerp(.62,.2,reveal)+Math.sin(t*.24)*.14,.08+Math.sin(t*.13)*.03);
  portal.scale.setScalar(lerp(.84,.79,reveal));
  canvas.style.opacity = t < 8 ? '1' : t < 14 ? '.28' : t < 20 ? '.95' : '.15';
  for(let i=0;i<rings.length;i++){
    rings[i].rotation.z=t*.1+i*.035;
    rings[i].position.z=-i*lerp(.16,.28,reveal);
  }
  segments.forEach((arc,i)=>{arc.rotation.z=t*(.24+i*.03)+i*1.1;});
  for(let i=0;i<particleCount;i++){
    const s=seeds[i];const z=((s.z+t*(.12+reveal*.18))%1)*7-6;
    positions[i*3]=Math.cos(s.angle+t*.05)*s.r;
    positions[i*3+1]=Math.sin(s.angle+t*.05)*s.r;
    positions[i*3+2]=z;
  }
  particlesGeo.attributes.position.needsUpdate=true;
  if(isGlobe){
    const p=smooth(14,15.2,t);
    camera.position.set(.15,.5,17.3);camera.lookAt(0,-.2,0);
    globe.position.set(0,-1.57,0);
    globe.scale.setScalar(lerp(.7,1,p));
    globe.rotation.set(.13, (t-14)*.19-.65, -.08);
    beacons.forEach((node,i)=>{node.position.copy(routes[i].getPoint(((t-14)*.44+i*.113)%1));});
  }
  if(t>=20 && t<26){
    portal.position.set(2,-1,-10);portal.rotation.y=.8;
    portal.scale.setScalar(1.35);
  }
  renderer.render(scene,camera);
}

function renderAt(t){
  renderWorld(t);
  let ix=0;for(let i=0;i<boundaries.length;i++)if(t>=boundaries[i])ix=i;
  chapter.textContent=`0${ix+1} / ${labels[ix]}`;
  chapterCount.textContent=`0${ix+1} — 06`;
  document.getElementById('typed').textContent='/http 3000'.slice(0,clamp(Math.floor((t-9)/.09)+1,0,10));
  document.getElementById('caret').style.opacity=t>10.2?'0':(Math.floor(t*2.5)%2?'1':'.15');
  const replayed=t>=24.35;
  document.getElementById('replay-text').textContent=replayed?'Replayed':'Replay';
  document.getElementById('replay-icon').textContent=replayed?'✓':'↻';
  document.getElementById('replay-status').textContent=replayed?'Replay complete':t>=23.7?'Replaying locally…':'Request captured';
}

tl.eventCallback('onUpdate',()=>renderAt(tl.time()));
window.addEventListener('hf-seek',(event)=>renderAt(event.detail.time));
export const timeline = tl;
window.__trqsh={seek(t){tl.seek(clamp(t,0,DURATION),false);renderAt(t);},renderer,scene,camera};
renderAt(0);
