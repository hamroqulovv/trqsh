import {createRequire} from 'node:module';
import {spawnSync} from 'node:child_process';
import {copyFileSync,renameSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url);
const ffmpeg=require('ffmpeg-static');
const probe=require('ffprobe-static').path;
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=JSON.parse(readFileSync(join(root,'assets/audio/source-manifest.json'),'utf8'));
const version=source.revision||3;
const original=join(root,'output/trqsh-cinematic-vertical.mp4');
const revision=join(root,`output/trqsh-cinematic-vertical-v${version}.mp4`);
const temp=join(root,`output/trqsh-cinematic-vertical-v${version}.tmp.mp4`);
function run(binary,args){
  const r=spawnSync(binary,args,{encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024});
  if(r.status!==0)throw new Error(r.stderr||String(r.error));
  return r.stdout.trim();
}
function videoHash(path){return run(ffmpeg,['-v','error','-i',path,'-map','0:v:0','-c','copy','-f','hash','-hash','sha256','-']);}
const before=videoHash(original);
run(ffmpeg,['-hide_banner','-v','error','-y','-i',original,'-i',join(root,'assets/audio/master.wav'),
  '-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','320k','-ar','48000','-ac','2',
  '-t','32','-map_metadata','-1','-metadata',`title=trqsh / audio revision ${version}`,
  '-movflags','+faststart',temp]);
const after=videoHash(temp);
if(before!==after)throw new Error('The encoded video stream changed while replacing the soundtrack');
const streams=JSON.parse(run(probe,['-v','error','-show_streams','-show_format','-of','json',temp]));
const a=streams.streams.find(s=>s.codec_type==='audio');
if(!a||a.channels!==2||Number(a.sample_rate)!==48000)throw new Error('Invalid replacement audio');
renameSync(temp,revision);
copyFileSync(revision,original);
writeFileSync(join(root,'output/audio-revision.json'),JSON.stringify({
  revision:version,complete:true,primaryFile:'trqsh-cinematic-vertical.mp4',
  shareFile:`trqsh-cinematic-vertical-v${version}.mp4`,backgroundMusic:source.backgroundMusic??true,
  encodedPictureUnchanged:before===after,videoStreamHash:after,
  music:source.music,oldScoreUsed:false,oldSoundEffectsUsed:false,
  audio:{codec:a.codec_name,channels:a.channels,sampleRate:Number(a.sample_rate),duration:Number(a.duration)}
},null,2));
console.log(`Primary MP4 and v${version} MP4 now use the replacement audio. Encoded picture is identical.`);
