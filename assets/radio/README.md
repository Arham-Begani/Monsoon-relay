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

## Rehearse with no external network

Run `python3 scripts/prepare_speech.py` while online. It builds the simulator,
checks the SHA-384 hashes of the Vosk library and model, and places the
verified files in the ignored `dist/` output. Serve that output directly with
`python3 -m http.server 8000 --bind 127.0.0.1 --directory dist`, then open
`http://127.0.0.1:8000` and select **Prepare audio for this tab**. The preparation status
confirms when the model is ready in the current tab. You can start a new tab
or reload the page with the external network disconnected as long as the local
server stays running. The demo sample and English audio uploads use the local
model. Live microphone recognition still depends on browser support.

A normal build replaces `dist/` and restores the downloadable speech setup.
For personal local rehearsal, keep the prepared copy on your rehearsal device
and avoid rebuilding it at the venue. The downloaded components are available
under the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0).
See the [Vosk Browser source](https://github.com/ccoreilly/vosk-browser) and
[official Vosk model list](https://alphacephei.com/vosk/models).
