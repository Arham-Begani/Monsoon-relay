"""Composite the real walkthrough and the verified BAND result into a narrated MP4."""
import argparse,json,subprocess
from pathlib import Path
p=Path(__file__).resolve().parent
base=p.parent
args=argparse.ArgumentParser()
args.add_argument('--preview',action='store_true',help='render a short QC excerpt')
preview=args.parse_args().preview
clip=base/'monsoon-relay-capture.mp4'
output=base/('edit/qc-excerpt.mp4' if preview else 'monsoon-relay-demo.mp4')
def duration(path):
 return float(subprocess.check_output(['ffprobe','-v','error','-show_entries','format=duration','-of','csv=p=0',str(path)]))
seconds=round(max(6.8,duration(p/'band-narration.wav')+1.15)*30)/30
fps=30
duration_string=f'{seconds:.3f}'
cmd=['ffmpeg','-nostdin','-hide_banner','-loglevel','error','-y']
if preview:cmd+=['-t','1.0']
cmd+=['-i',str(clip),'-loop','1','-framerate','30','-t',duration_string,'-i',str(p/'band-receipt.png'),'-i',str(p/'band-narration.wav')]
graph=';'.join([
 '[0:v]fps=30,format=yuv420p,setsar=1,setpts=PTS-STARTPTS[v0]',
 '[0:a]aformat=sample_rates=48000:channel_layouts=mono,asetpts=PTS-STARTPTS[a0]',
 f'[1:v]format=yuv420p,setsar=1,fade=t=in:st=0:d=0.22,trim=duration={duration_string},setpts=PTS-STARTPTS[v1]',
 f'[2:a]loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000,aformat=channel_layouts=mono,adelay=350,apad,atrim=duration={duration_string},asetpts=PTS-STARTPTS[a1]',
 '[v0][a0][v1][a1]concat=n=2:v=1:a=1[v][a]'])
cmd+=['-filter_complex_threads','2','-filter_complex',graph,'-map','[v]','-map','[a]','-c:v','libx264','-threads','2','-preset','veryfast','-crf','18','-c:a','aac','-b:a','128k','-movflags','+faststart',str(output)]
subprocess.run(cmd,check=True)
length=duration(output)
assert length<120 and (preview or length>duration(clip)+5)
print(json.dumps({'output':str(output),'seconds':length,'edit':'source walkthrough plus verified BAND result and narration'}))
