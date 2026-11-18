"""End-to-end acoustic test with the published recognizer and two distinct .wav files."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import shutil
import subprocess
from playwright.sync_api import expect, sync_playwright

base = os.environ.get("RELAY_URL", "http://127.0.0.1:8000/")
with TemporaryDirectory() as temp, sync_playwright() as p:
    opened = Path(temp) / "reopening.wav"
    subprocess.run(["ffmpeg", "-loglevel", "error", "-f", "lavfi", "-i",
                    "flite=text='This road is open.':voice=slt", "-af", "apad=pad_dur=0.35",
                    "-ac", "1", "-ar", "16000", str(opened)], check=True)
    browser = p.chromium.launch(executable_path=shutil.which("chromium"))
    page = browser.new_page()
    page.goto(base)
    page.locator("#voice-options summary").click()
    page.locator("#report-text").fill("this road is flooded")
    page.locator("#parse-report").click()
    expect(page.locator("#confirm-report")).to_be_visible()
    page.locator("#radio-sample").click()
    expect(page.locator("#confirm-report")).to_be_hidden()
    expect(page.locator("#confirm-report")).to_be_visible(timeout=115000)
    expect(page.locator("#report-text")).to_have_value("this road is flooded")
    expect(page.locator("#closed-count")).to_have_text("0 roads closed")
    page.locator("#confirm-report").click()
    expect(page.locator("#total")).to_have_text("12")
    page.locator("#audio-upload").set_input_files(opened)
    expect(page.locator("#confirm-report")).to_be_visible(timeout=30000)
    expect(page.locator("#report-text")).to_have_value("this road is open")
    expect(page.locator("#closed-count")).to_have_text("1 road closed")
    page.locator("#confirm-report").click()
    expect(page.locator("#total")).to_have_text("20")
    browser.close()
    print("Real Vosk WASM transcribed two different waveforms. Closure and reopening both required confirmation.")
