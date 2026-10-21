import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,statSync} from 'node:fs';
import {join,dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const sharp=require('sharp');
const ffmpeg=require('ffmpeg-static');
const probe=require('ffprobe-static').path;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const output=join(root,'output');
const videoName=process.argv[2]||'trqsh-cinematic-vertical-v3.mp4';
const video=join(output,videoName);
const frames=join(output,'qa-frames');
mkdirSync(frames,{recursive:true});
function run(bin,args){
  const r=spawnSync(bin,args,{encoding:'utf8',windowsHide:true,maxBuffer:20*1024*1024});
  if(r.status!==0)throw new Error(`${bin}: ${r.stderr||r.error}`);
  return r;
}
const metadata=JSON.parse(run(probe,['-v','error','-show_format','-show_streams','-of','json',video]).stdout);
const v=metadata.streams.find(s=>s.codec_type==='video');
const a=metadata.streams.find(s=>s.codec_type==='audio');
const assert=(ok,message)=>{if(!ok)throw new Error(message);};
assert(v.width===1080 && v.height===1920,'Video dimensions differ from the vertical brief');
assert(v.r_frame_rate==='60/1','Expected 60 fps');
assert(Number(v.nb_frames)===1920,'Expected exactly 1920 video frames');
assert(Math.abs(Number(metadata.format.duration)-32)<.05,'Expected 32 seconds');
assert(v.codec_name==='h264' && v.pix_fmt==='yuv420p','Expected broadly compatible H.264 4:2:0');
assert(a && a.channels===2 && a.codec_name==='aac','Expected stereo AAC soundtrack');
const decode=run(ffmpeg,['-hide_banner','-v','error','-i',video,'-f','null','-']);
assert(!decode.stderr.trim(),`Decode errors: ${decode.stderr}`);
const times=[0,.5,2,2.5,3.9833,4,4.5,6,6.5,7.9833,8,10,10.5,12,13.9833,14,16,18,18.5,19.9833,20,22,24,24.5,24.8,25.9833,26,26.5,29,29.5,31.9833];
const decoded=[];
for(let i=0;i<times.length;i++){
  const file=join(frames,`frame-${String(i).padStart(2,'0')}-${times[i]}s.jpg`);
  run(ffmpeg,['-v','error','-y','-ss',String(times[i]),'-i',video,'-frames:v','1','-q:v','2',file]);
  decoded.push({time:times[i],file});
}
const comparePairs=[[2,2.5],[6,6.5],[10,10.5],[18,18.5],[24,24.5],[29,29.5]];
const motion=[];
for(const [start,end]of comparePairs){
  const source=decoded.find(f=>f.time===start).file;
  const target=decoded.find(f=>f.time===end).file;
  const aa=await sharp(source).resize(216,384).removeAlpha().raw().toBuffer();
  const bb=await sharp(target).resize(216,384).removeAlpha().raw().toBuffer();
  let difference=0;for(let i=0;i<aa.length;i++)difference+=Math.abs(aa[i]-bb[i]);
  difference/=aa.length;
  assert(difference>.025,`No measurable motion between ${start} and ${end}`);
  motion.push({start,end,meanAbsolutePixelDifference:Number(difference.toFixed(4))});
}
const selected=[2,6,12,18,24.8,29];
const composites=[];
for(let i=0;i<selected.length;i++){
  const frame=decoded.find(f=>f.time===selected[i]);
  const jpg=await sharp(frame.file).resize(324,576).toBuffer();
  composites.push({input:jpg,left:24+(i%3)*348,top:48+Math.floor(i/3)*626});
  const label=Buffer.from(`<svg width="324" height="34"><text x="2" y="23" fill="#dce0da" font-size="17" font-family="Arial">${i+1} / ${selected[i]}s</text></svg>`);
  composites.push({input:label,left:24+(i%3)*348,top:14+Math.floor(i/3)*626});
}
await sharp({create:{width:1068,height:1276,channels:3,background:'#111416'}}).composite(composites).jpeg({quality:91}).toFile(join(output,'storyboard.jpg'));
await sharp(decoded.find(f=>f.time===29).file).jpeg({quality:95}).toFile(join(output,'poster.jpg'));
const meter=run(ffmpeg,['-hide_banner','-i',video,'-vn','-af','loudnorm=I=-14:TP=-1.2:LRA=8:print_format=json','-f','null','-']).stderr;
const match=meter.match(/\{\s*"input_i"[\s\S]*?\}/);
const loudness=match?JSON.parse(match[0]):null;
assert(loudness && Number.isFinite(Number(loudness.input_i)),'Audio metering failed');
assert(Number(loudness.input_tp)<0,'Audio has intersample clipping');
const manifest=JSON.parse(readFileSync(join(root,'assets/audio/source-manifest.json'),'utf8'));
assert(manifest.backgroundMusic===false,'Current audio manifest still includes background music');
const pcm=spawnSync(ffmpeg,['-v','error','-i',video,'-map','0:a:0','-ar','48000','-ac','2','-f','f32le','-'],{windowsHide:true,maxBuffer:20*1024*1024});
assert(pcm.status===0,'Failed to decode audio for silence checks');
const sampleCount=Math.floor(pcm.stdout.length/8);
const cueMask=new Uint8Array(sampleCount);
for(const cue of manifest.events){
  const start=Math.max(0,Math.floor((cue.time-.12)*48000));
  const end=Math.min(sampleCount,Math.ceil((cue.time+cue.duration+.12)*48000));
  cueMask.fill(1,start,end);
}
let outsideEnergy=0,outsideSamples=0;
for(let i=0;i<sampleCount;i++)if(!cueMask[i]){
  const left=pcm.stdout.readFloatLE(i*8),right=pcm.stdout.readFloatLE(i*8+4);
  outsideEnergy+=left*left+right*right;outsideSamples+=2;
}
const outsideDb=20*Math.log10(Math.max(1e-6,Math.sqrt(outsideEnergy/Math.max(1,outsideSamples))));
assert(outsideDb < -70,'Background audio is audible outside the sound-effect cues');
const report={passed:true,revision:3,renderer:'Hyperframes 0.8.164',video:{file:videoName,width:v.width,height:v.height,fps:v.r_frame_rate,frames:Number(v.nb_frames),duration:Number(metadata.format.duration),codec:v.codec_name,pixelFormat:v.pix_fmt,bytes:statSync(video).size,sha256:createHash('sha256').update(readFileSync(video)).digest('hex')},audio:{backgroundMusic:false,codec:a.codec_name,channels:a.channels,sampleRate:Number(a.sample_rate),duration:Number(a.duration),loudness,outsideEffectCuesRmsDb:outsideDb,effectCount:manifest.events.length},fullDecode:'passed without errors',motionChecks:motion,decodedFrameTimes:times};
writeFileSync(join(output,'verification.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
