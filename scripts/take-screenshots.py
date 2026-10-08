"""Take README screenshots of every aidit page.

Run against the demo instance so no real configs end up in the repo:

    scripts/demo/run.sh 4511 &
    python3 scripts/take-screenshots.py            # AIDIT_URL=http://127.0.0.1:4511
"""

import os
from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = os.environ.get("AIDIT_URL", "http://127.0.0.1:4511")
OUT = Path(__file__).resolve().parent.parent / "docs" / "screenshots"
OUT.mkdir(parents=True, exist_ok=True)


def prepare_diff(page):
    selects = page.locator("select")
    selects.nth(0).select_option("cursor")
    selects.nth(1).select_option("claude-code")


PAGES = [
    ("overview", "/", None),
    ("mcp", "/mcp/claude-code", None),
    ("skills", "/skills", None),
    ("diff", "/diff", prepare_diff),
    ("settings", "/settings", None),
    ("paths", "/settings/paths", None),
]

with sync_playwright() as p:
    try:
        browser = p.chromium.launch(headless=True)
    except Exception:
        # Bundled browser missing or out of date: fall back to installed Chrome.
        browser = p.chromium.launch(headless=True, channel="chrome")
    ctx = browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=2,
        color_scheme="dark",
    )
    page = ctx.new_page()

    for slug, path, prepare in PAGES:
        page.goto(f"{BASE}{path}", wait_until="networkidle", timeout=15000)
        if prepare:
            prepare(page)
        page.wait_for_timeout(800)
        out_path = OUT / f"{slug}.png"
        page.screenshot(path=str(out_path), full_page=False)
        print(f"saved {out_path}")

    browser.close()
