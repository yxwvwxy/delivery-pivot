#!/usr/bin/env python3
"""Capture docs/daily-performance-report.html to an animated GIF (Canvas pipeline timing)."""

from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "docs" / "daily-performance-report.html"
OUT = ROOT / "docs" / "daily-performance-report.gif"

STEP_MS = 2200
CYCLES = 1
FRAME_MS = 110
DURATION_MS = STEP_MS * 3 * CYCLES


def main() -> None:
    frames: list[Image.Image] = []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": 920, "height": 1400},
            device_scale_factor=1.5,
        )
        page.goto(HTML.as_uri(), wait_until="networkidle")
        frame_count = (DURATION_MS + FRAME_MS - 1) // FRAME_MS
        for _ in range(frame_count):
            png = page.screenshot(full_page=True)
            frames.append(Image.open(__import__("io").BytesIO(png)).convert("P", palette=Image.ADAPTIVE))
            page.wait_for_timeout(FRAME_MS)
        browser.close()

    duration_cs = FRAME_MS // 10  # centiseconds for GIF
    frames[0].save(
        OUT,
        save_all=True,
        append_images=frames[1:],
        duration=duration_cs,
        loop=0,
        optimize=False,
    )
    print(f"Wrote {OUT} ({len(frames)} frames)")


if __name__ == "__main__":
    main()
