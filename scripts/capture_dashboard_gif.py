#!/usr/bin/env python3
"""Capture docs/daily-performance-report.html to an animated GIF (Canvas pipeline timing)."""

import io
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "docs" / "daily-performance-report.html"
OUT = ROOT / "docs" / "daily-performance-report.gif"

STEP_MS = 2200
CYCLES = 1
FRAME_MS = 200
DURATION_MS = STEP_MS * 3 * CYCLES


def quantize_with_shared_palette(frames_rgb: list[Image.Image]) -> list[Image.Image]:
    """One palette for all frames — avoids color flicker between identical frames."""
    palette_ref = frames_rgb[0].quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    out: list[Image.Image] = [palette_ref]
    for frame in frames_rgb[1:]:
        out.append(frame.quantize(palette=palette_ref))
    return out


def main() -> None:
    frames_rgb: list[Image.Image] = []
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
            frames_rgb.append(Image.open(io.BytesIO(png)).convert("RGB"))
            page.wait_for_timeout(FRAME_MS)
        browser.close()

    frames_p = quantize_with_shared_palette(frames_rgb)
    duration_cs = FRAME_MS // 10
    frames_p[0].save(
        OUT,
        save_all=True,
        append_images=frames_p[1:],
        duration=duration_cs,
        loop=0,
        optimize=True,
        disposal=2,
    )
    print(f"Wrote {OUT} ({len(frames_p)} frames)")


if __name__ == "__main__":
    main()
