# Sample field transmission

`field-transmission.wav` is a synthetic English demonstration recording generated
with the Flite `slt` voice. The utterance is “This road is flooded.”

```sh
ffmpeg -f lavfi -i "flite=text='This road is flooded.':voice=slt" \
  -af apad=pad_dur=0.35 -ar 16000 -ac 1 field-transmission.wav
```

The browser transcribes the sample and short English uploads on-device using
[Vosk Browser 0.0.8](https://www.npmjs.com/package/vosk-browser/v/0.0.8)
and the [Vosk small English model 0.15](https://alphacephei.com/vosk/models).
Both are distributed under Apache 2.0. The browser fetches their versioned,
SHA-384-pinned assets only when the operator requests audio recognition. First
use downloads the recognizer and about 41 MB of model data. Audio stays in the
browser. The transcript is handed to the same review flow as a typed report.
