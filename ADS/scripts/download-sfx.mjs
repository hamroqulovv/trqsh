import {mkdir,writeFile,access} from 'node:fs/promises';
const folder=new URL('../assets/audio/sources/',import.meta.url);
await mkdir(folder,{recursive:true});
for(const id of [166,1113,2531]){
  const file=new URL(`mixkit-sfx-${id}.wav`,folder);
  try{await access(file);continue;}catch{}
  const response=await fetch(`https://assets.mixkit.co/active_storage/sfx/${id}/${id}.wav`);
  if(!response.ok)throw new Error(`Effect ${id}: HTTP ${response.status}`);
  await writeFile(file,new Uint8Array(await response.arrayBuffer()));
  console.log(`Downloaded licensed video-edit working effect ${id}`);
}
