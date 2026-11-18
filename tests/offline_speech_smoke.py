"""Run against an HTTP server serving a prepared dist/. Requires Playwright and ffmpeg."""

import os
from pathlib import Path
import shutil
import subprocess
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit

from playwright.sync_api import expect, sync_playwright


base = os.environ.get("RELAY_URL", "http://127.0.0.1:8000/")
origin = urlsplit(base).netloc
external_requests = []


def block_external(route):
    url = urlsplit(route.request.url)
    if url.scheme in ("http", "https") and url.netloc != origin:
        external_requests.append(route.request.url)
        route.abort()
    else:
        route.continue_()


with TemporaryDirectory() as temp, sync_playwright() as playwright:
    opened = Path(temp) / "reopening.wav"
    subprocess.run([
        "ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i",
        "flite=text='This road is open.':voice=slt", "-af", "apad=pad_dur=0.35",
        "-ac", "1", "-ar", "16000", str(opened),
    ], check=True)
    browser = playwright.chromium.launch(executable_path=shutil.which("chromium"))
    page = browser.new_page()
    page.context.route("**/*", block_external)
    page.goto(base)
    expect(page.locator("script[data-rehearsal-assets]")).to_have_count(1)
    page.locator("#voice-options").evaluate("(element) => { element.open = true; }")
    prepare = page.locator("#radio-prepare")

    # Verify a bad local artifact is rejected and recovery stays in the same tab.
    def corrupt_asset(route):
        route.fulfill(content_type="application/javascript", body="throw new Error('tampered');")

    page.route("**/rehearsal/vosk.js", corrupt_asset)
    prepare.click()
    expect(page.locator("#radio-status")).to_contain_text("Could not load the local")
    page.unroute("**/rehearsal/vosk.js", corrupt_asset)
    prepare.click()
    expect(page.locator("#radio-status")).to_have_text(
        "English audio recognition is ready in this tab.", timeout=110000
    )

    page.locator("#radio-sample").click()
    expect(page.locator("#report-text")).to_have_value("this road is flooded", timeout=30000)
    expect(page.locator("#closed-count")).to_have_text("0 roads closed")
    page.locator("#confirm-report").click()
    expect(page.locator("#closed-count")).to_have_text("1 road closed")

    page.locator("#audio-upload").set_input_files(opened)
    expect(page.locator("#report-text")).to_have_value("this road is open", timeout=30000)
    expect(page.locator("#closed-count")).to_have_text("1 road closed")
    page.locator("#confirm-report").click()
    expect(page.locator("#closed-count")).to_have_text("0 roads closed")

    page.reload()
    page.locator("#radio-sample").click()
    expect(page.locator("#report-text")).to_have_value("this road is flooded", timeout=110000)
    assert not external_requests, external_requests
    browser.close()
    print("Offline speech passed: integrity rejection, retry, preload, sample, upload and reload.")
