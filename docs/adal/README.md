# Render the demo with AdaL

## Source capture

[Monsoon Relay source video](monsoon-relay-capture.mp4) is an 83.5-second, 1080p screen recording of the working dashboard in Chromium. The browser transcribed the original synthetic radio sample with Vosk. The edit mixes that same file at the recorded playback cue and includes locally rendered Piper narration and open captions. AdaL sign-in is still needed to produce the sponsor export.

## Import and export

1. Keep [the source capture](monsoon-relay-capture.mp4) at `docs/adal/monsoon-relay-capture.mp4` relative to the repository root. See [demo-prompt.md](demo-prompt.md) for the edit brief.
2. Open the repository in the AdaL Desktop app or [install the official CLI](https://github.com/SylphAI-Inc/adal-cli#install-adal-cli). From the repository root, run `adal` and complete the first-time browser sign-in if prompted. Paste the contents of [demo-prompt.md](demo-prompt.md) into the AdaL chat and review tool prompts. Video Producer is built in. [AdaL Video Producer](https://docs.sylph.ai/features/video-producer)
3. Open the resulting video and review the footage, claims, and captions. Export its current version as MP4 from the Desktop player or use the final MP4 path reported by the CLI. AdaL defaults to storing video projects under `~/AdaL/Videos/`. [AdaL video export](https://docs.sylph.ai/features/video-producer#export-a-file-to-share)

## Authenticated CLI option

After first-time sign-in, run this from the repository root. If headless stops at a tool approval, continue interactively and review that action in AdaL. [Headless authentication and permissions](https://docs.sylph.ai/integration/headless)

```sh
adal --agent-mode video --prompt-file docs/adal/demo-prompt.md --permission-mode acceptEdits -o json
```

Check the reported MP4 with `ffprobe -v error -show_entries format=duration -of csv=p=0 /path/to/monsoon-relay-demo.mp4`. Confirm the video is under 120 seconds and the closure, transfer, and remaining gap are readable. Retain the AdaL video project or the CLI response if you need evidence that AdaL performed the edit.
