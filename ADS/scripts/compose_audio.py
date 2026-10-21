"""Revision 3: sound effects only. No music, tones, hum, or audio bed.

Uses three Mixkit Sound Effects Free License recordings as local video-edit
assets. Exact silence outside the authored cues is verified before delivery.
"""
from pathlib import Path
import hashlib
import json
import subprocess
import shutil
import numpy as np
from scipy import signal
from scipy.io import wavfile

ROOT=Path(__file__).resolve().parent.parent
OUT=ROOT/'assets'/'audio'
FFMPEG=ROOT/'node_modules'/'ffmpeg-static'/'ffmpeg.exe'
SR,DURATION=48000,32
N=SR*DURATION
mix=np.zeros((N,2),dtype=np.float64)
mask=np.zeros(N,dtype=bool)
events=[]
sources=[]

def read_effect(item,title):
    path=OUT/'sources'/f'mixkit-sfx-{item}.wav'
    result=subprocess.run([str(FFMPEG),'-v','error','-i',str(path),'-ar',str(SR),'-ac','2','-f','f32le','-'],capture_output=True,check=True)
    data=np.frombuffer(result.stdout,dtype='<f4').reshape(-1,2).astype(np.float64)
    peak=np.max(np.abs(data))
    active=np.flatnonzero(np.max(np.abs(data),axis=1)>peak*.008)
    data=data[max(0,active[0]-240):min(len(data),active[-1]+480)]
    # Soften sharp high-frequency transients without adding a tonal layer.
    data=signal.sosfilt(signal.butter(2,5500,'lowpass',fs=SR,output='sos'),data,axis=0)
    sources.append({'id':item,'title':title,'url':f'https://assets.mixkit.co/active_storage/sfx/{item}/{item}.wav','sha256':hashlib.sha256(path.read_bytes()).hexdigest()})
    return data

sweep=read_effect(166,'Fast small sweep transition')
click=read_effect(1113,'Mouse click close')
keyboard=read_effect(2531,'Typing on a laptop keyboard')

def place(data,at,duration,peak_db,name,pan=0):
    count=round(duration*SR)
    # Resample only the short transition recording; tactile samples are cropped.
    if name=='sweep':
        data=signal.resample(data,count,axis=0)
    else:
        data=data[:count].copy()
        if len(data)<count:data=np.pad(data,((0,count-len(data)),(0,0)))
    data=data.copy()
    fade=min(round(.012*SR),count//3)
    data[:fade]*=np.sin(np.linspace(0,np.pi/2,fade))[:,None]**2
    data[-fade:]*=np.cos(np.linspace(0,np.pi/2,fade))[:,None]**2
    data*=10**(peak_db/20)/max(float(np.max(np.abs(data))),1e-9)
    data[:,0]*=np.sqrt(1-pan);data[:,1]*=np.sqrt(1+pan)
    start=round(at*SR)
    mix[start:start+count]+=data
    mask[start:start+count]=True
    events.append({'time':at,'duration':duration,'sound':name,'peak_dbfs':peak_db})

for at,dur,level,pan in [(.55,.48,-17,0),(4.1,.72,-13,-.18),(4.82,.48,-19,.18),(8.05,.68,-14,0),(14.08,.68,-15,0),(14.48,.4,-20,-.2),(14.96,.4,-20,.15),(15.44,.4,-20,-.1),(20.05,.72,-14,0),(26.05,1.0,-13,0),(28.12,.5,-20,0)]:
    place(sweep,at,dur,level,'sweep',pan)
place(keyboard,9.2,1.05,-18,'keyboard')
for at,level in [(10.68,-17),(21.1,-22),(21.28,-22),(21.46,-22),(23.7,-14),(24.25,-19),(28.55,-21)]:
    place(click,at,.13,level,'click')

peak=float(np.max(np.abs(mix)))
if peak>10**(-6/20):mix*=10**(-6/20)/peak
assert np.max(np.abs(mix[~mask]))==0,'Background sound exists outside the sound-effect cues'
wavfile.write(OUT/'effects-v3-premaster.wav',SR,np.int16(mix*32767))
subprocess.run([str(FFMPEG),'-hide_banner','-v','error','-y','-i',str(OUT/'effects-v3-premaster.wav'),'-c:a','pcm_s24le',str(OUT/'effects-v3.wav')],check=True)
shutil.copyfile(OUT/'effects-v3.wav',OUT/'master.wav')
shutil.copyfile(OUT/'effects-v3.wav',OUT/'sound-effects.wav')
manifest={'revision':3,'backgroundMusic':False,'pitchedSynthesis':False,'duration':32,'sample_rate':SR,'channels':2,'silentFraction':float(np.mean(~mask)),'outsideCuesPeak':float(np.max(np.abs(mix[~mask]))),'sources':sources,'license':'Mixkit Sound Effects Free License','license_url':'https://mixkit.co/license/#sfxFree','local_license':'reference/mixkit-sfx-license.html','events':events}
(OUT/'source-manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
(OUT/'cue-sheet.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
print(f'SFX-only master ready. Music: none. Exact silence outside cues: {np.mean(~mask):.1%}.')
