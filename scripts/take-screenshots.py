"""Take screenshots of every aidit dashboard page for the README."""

from pathlib import Path
from playwright.sync_api import sync_playwright

BASE = "http://127.0.0.1:4511"
OUT = Path("/Users/onur/Documents/workspace/aidit/docs/screenshots")
OUT.mkdir(parents=True, exist_ok=True)

PAGES = [
    ("overview", "/", "Agent overview"),
    ("mcp", "/mcp", "MCP config"),
    ("skills", "/skills", "Skills"),
    ("diff", "/diff", "Diff & sync"),
    ("settings", "/settings", "Settings"),
    ("paths", "/settings/paths", "Path registry"),
]

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    ctx = browser.new_context(
        viewport={"width": 1440, "height": 900},
        device_scale_factor=2,
        color_scheme="dark",
    )
    page = ctx.new_page()

    for slug, path, _label in PAGES:
        url = f"{BASE}{path}"
        page.goto(url, wait_until="networkidle", timeout=15000)
        page.wait_for_timeout(800)
        out_path = OUT / f"{slug}.png"
        page.screenshot(path=str(out_path), full_page=False)
        print(f"saved {out_path}")

    browser.close()
