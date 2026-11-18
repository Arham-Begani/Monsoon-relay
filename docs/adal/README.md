# Final competition video

**[Watch the 90.65-second walkthrough](https://monsoon-relay.vercel.app/watch.html) · [Final MP4](monsoon-relay-demo.mp4) · [AdaL render receipt](render-receipt.json)**

The authenticated AdaL CLI 1.11.13 invoked its Bash tool to run the local FFmpeg edit. Ollama supplied the local model. The edit preserves the original screen recording, spoken narration, demo-radio audio and open captions, then appends a narrated card from the [verified BAND room exchange](../band-live-run.md). The production player serves this export.

| Export detail | Verified value |
|---|---|
| Duration | 90.653 seconds |
| Picture | 1920 × 1080, H.264, 30 fps |
| Audio | AAC, 48 kHz |
| File size | 7,857,798 bytes |
| SHA-256 | `35e4d43f99e3eb9c22eedfd5bf313665b06c3f43a4c35e39ab8f062aba8d2e18` |

## Reproduce the edit

The [83.5-second source capture](monsoon-relay-capture.mp4) shows the actual application in Chromium, including on-device Vosk recognition. The closing card and its English narration are in [edit](edit). From the repository root, ask the authenticated AdaL CLI to execute the following local render command with its Bash tool. Python 3 and FFmpeg with libx264 and AAC encoding are required. The recipe resolves its inputs relative to its file location.

```sh
python3 docs/adal/edit/render.py
```

The AdaL execution receipt records the tool call, tool status, local model, exit code and digest of the published file. The repository also retains the [original creative brief](demo-prompt.md). [AdaL CLI](https://github.com/SylphAI-Inc/adal-cli) · [AdaL headless usage](https://docs.sylph.ai/integration/headless)
