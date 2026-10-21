#!/usr/bin/env python3
"""Capture dashboard preview assets (WebM + optional GIF) from docs/daily-performance-report.html."""

import io
import shutil
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "docs" / "daily-performance-report.html"
GIF_OUT = ROOT / "docs" / "daily-performance-report.gif"
WEBM_OUT = ROOT / "docs" / "daily-performance-report.webm"

STEP_MS = 2200  # match canvases/ewr-performance-dashboard.canvas.tsx


def capture_step_frames(page) -> list[Image.Image]:
    """One frame per pipeline step; GIF duration per frame = STEP_MS (same as Canvas interval)."""
    frames_rgb: list[Image.Image] = []
    for step in range(3):
        page.evaluate("(s) => window.__setPipelineStep(s)", step)
        page.wait_for_timeout(150)
        png = page.screenshot(full_page=True)
        frames_rgb.append(Image.open(io.BytesIO(png)).convert("RGB"))
    return frames_rgb


def write_gif(frames_rgb: list[Image.Image]) -> None:
    palette_ref = frames_rgb[0].quantize(colors=256, method=Image.Quantize.MEDIANCUT)
    frames_p = [f.quantize(palette=palette_ref, dither=Image.Dither.NONE) for f in frames_rgb]
    step_duration = [STEP_MS, STEP_MS, STEP_MS]
    frames_p[0].save(
        GIF_OUT,
        save_all=True,
        append_images=frames_p[1:],
        duration=step_duration,
        loop=0,
        optimize=False,
        disposal=1,
    )
    print(f"Wrote {GIF_OUT} ({len(frames_p)} frames @ {STEP_MS} ms each)")


def capture_webm(page_url: str) -> None:
    tmp = Path(tempfile.mkdtemp(prefix="dashboard-capture-"))
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch()
            context = browser.new_context(
                viewport={"width": 920, "height": 1400},
                device_scale_factor=1.5,
                record_video_dir=str(tmp),
                record_video_size={"width": 920, "height": 1400},
            )
            page = context.new_page()
            page.goto(page_url, wait_until="networkidle")
            page.wait_for_timeout(STEP_MS * 3 + 400)
            context.close()
            browser.close()

        videos = sorted(tmp.glob("*.webm"))
        if not videos:
            raise RuntimeError("No WebM recording produced")
        shutil.copy(videos[-1], WEBM_OUT)
        print(f"Wrote {WEBM_OUT}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def main() -> None:
    capture_url = HTML.as_uri() + "?capture=1"
    live_url = HTML.as_uri()

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": 920, "height": 1400},
            device_scale_factor=1.5,
        )
        page.goto(capture_url, wait_until="networkidle")
        frames_rgb = capture_step_frames(page)
        browser.close()

    write_gif(frames_rgb)
    capture_webm(live_url)


if __name__ == "__main__":
    main()
