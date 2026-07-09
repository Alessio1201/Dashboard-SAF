from playwright.sync_api import sync_playwright
import sys

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    errors = []
    page.on("console", lambda msg: errors.append(f"[{msg.type}] {msg.text}") if msg.type=='error' else None)
    page.on("pageerror", lambda exc: errors.append(f"[pageerror] {exc}"))
    page.goto("file:///sessions/wonderful-sweet-pascal/mnt/outputs/eSAF_Modello_Interattivo.html")
    page.wait_for_timeout(3000)
    print("ERRORS:", errors)
    kero = page.locator("#k_kerobep").text_content()
    van = page.locator("#k_van").text_content()
    lcoh = page.locator("#k_lcoh").text_content()
    print("KPI kerobep", kero, "van", van, "lcoh", lcoh)
    page.screenshot(path="screenshot.png", full_page=True)
    browser.close()
