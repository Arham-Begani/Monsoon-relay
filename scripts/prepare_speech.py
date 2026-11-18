#!/usr/bin/env python3
"""Build a local rehearsal copy of the simulator with verified ASR assets."""

import base64
import hashlib
from pathlib import Path
import subprocess
import sys
import tempfile
from urllib.request import urlopen


ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
REHEARSAL_ASSETS = "assets/radio/rehearsal"
ASSETS = (
    (
        "vosk.js",
        "https://cdn.jsdelivr.net/npm/vosk-browser@0.0.8/dist/vosk.js",
        "nqyY8clHf93uBYFkgkACShMTuvE3U57yXSJaf0Ws+XgzcoUe6OB/1BiOfHqKOWeg",
        6_000_000,
    ),
    (
        "vosk-model-small-en-us-0.15.tar.gz",
        "https://ccoreilly.github.io/vosk-browser/models/vosk-model-small-en-us-0.15.tar.gz",
        "eq22GjcvmxRBpqH/h4DNPIG+8QhLmcxbrpYcPpRLMTgr18q5NAErUYZR5HxRFSnP",
        42_000_000,
    ),
)


def download(destination, url, sha384, max_bytes):
    """Promote only verified bytes to the final rehearsal directory."""
    digest = hashlib.sha384()
    total_bytes = 0
    with urlopen(url, timeout=25) as response, destination.open("wb") as output:
        while chunk := response.read(1024 * 1024):
            total_bytes += len(chunk)
            if total_bytes > max_bytes:
                raise ValueError(f"{destination.name} exceeds expected size")
            digest.update(chunk)
            output.write(chunk)
    if base64.b64encode(digest.digest()).decode("ascii") != sha384:
        raise ValueError(f"SHA-384 mismatch for {destination.name}")


def prepare():
    subprocess.run(["node", "scripts/build.cjs"], cwd=ROOT, check=True)
    index = DIST / "index.html"
    html = index.read_text(encoding="utf-8")
    marker = '<script src="radio.js"></script>'
    if html.count(marker) != 1:
        raise ValueError("Expected one radio.js script tag in the built index.html")

    target = DIST / REHEARSAL_ASSETS
    with tempfile.TemporaryDirectory(prefix=".speech-", dir=target.parent) as directory:
        temporary = Path(directory)
        staged_assets = temporary / "rehearsal"
        staged_assets.mkdir()
        for filename, url, sha384, max_bytes in ASSETS:
            print(f"Downloading and verifying {filename}...", flush=True)
            download(staged_assets / filename, url, sha384, max_bytes)

        configured_index = temporary / "index.html"
        configured_index.write_text(html.replace(
            marker,
            f'<script src="radio.js" data-rehearsal-assets="./{REHEARSAL_ASSETS}/"></script>',
        ), encoding="utf-8")
        staged_assets.replace(target)
        configured_index.replace(index)

    print("Offline English speech assets are ready in dist/.")
    print("Serve without rebuilding: python3 -m http.server 8000 --bind 127.0.0.1 --directory dist")
    print("Open http://127.0.0.1:8000 and select Prepare audio for this tab.")


if __name__ == "__main__":
    try:
        prepare()
    except (OSError, ValueError, subprocess.CalledProcessError) as error:
        sys.exit(f"Could not prepare offline speech: {error}")
