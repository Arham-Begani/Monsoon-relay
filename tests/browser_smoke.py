"""Run against the built static app with RELAY_URL=http://localhost:8000/."""
import json
import os
import shutil
from playwright.sync_api import sync_playwright, expect

base = os.environ.get("RELAY_URL", "http://127.0.0.1:8000/")
with sync_playwright() as playwright:
    browser = playwright.chromium.launch(executable_path=shutil.which("chromium"))
    context = browser.new_context(viewport={"width": 1280, "height": 800})
    page = context.new_page()
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base)
    expect(page.locator("#total")).to_have_text("20")
    page.locator("#voice-options summary").click()
    page.locator("#report-text").fill("भास्करन रोड सेक्शन दो बंद है")
    page.locator("#parse-report").click()
    expect(page.locator("#total")).to_have_text("20")
    page.locator("#confirm-report").click()
    expect(page.locator("#total")).to_have_text("12")
    expect(page.locator("#gap")).to_have_text("8")
    expect(page.locator("#gain")).to_have_text("12")
    page.locator("#evidence").click()
    receipt = json.loads(page.locator("#receipt-body").inner_text())
    assert receipt["transport"] == "Three browser Web Workers"
    assert receipt["west"]["etaMinutes"] == 21 and receipt["east"]["etaMinutes"] == 8
    assert receipt["messages"][-1]["type"] == "complete"
    page.keyboard.press("Escape")
    page.locator("#reserved").fill("18")
    expect(page.locator("#total")).to_have_text("2")
    page.locator("#reset").click()
    expect(page.locator("#total")).to_have_text("20")
    page.goto(base + "#v=1&roads=30&reserve=18&pick=30")
    expect(page.locator("#gap")).to_have_text("18")
    page.set_viewport_size({"width": 390, "height": 844})
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
    page.locator("#toggle").click()
    expect(page.locator("#total")).to_have_text("20")
    assert not errors, errors
    browser.close()
    print("Browser smoke passed on desktop and mobile, including real Web Workers and a confirmed Hindi report.")
