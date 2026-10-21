#!/usr/bin/env python3
"""Record dashboard preview: MP4 (real-time pipeline steps) + GIF (for GitHub README img)."""

import io
import shutil
import subprocess
import tempfile
from pathlib import Path

from PIL import Image
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "docs" / "daily-performance-report.html"
GIF_OUT = ROOT / "docs" / "daily-performance-report.gif"
WEBM_OUT = ROOT / "docs" / "daily-performance-report.webm"
MP4_OUT = ROOT / "docs" / "daily-performance-report.mp4"

STEP_MS = 1500  # match canvases/ewr-performance-dashboard.canvas.tsx


def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as e:
        raise SystemExit("Install imageio-ffmpeg: python3 -m pip install imageio-ffmpeg") from e


def capture_gif_frames(page) -> list[Image.Image]:
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
    frames_p[0].save(
        GIF_OUT,
        save_all=True,
        append_images=frames_p[1:],
        duration=[STEP_MS, STEP_MS, STEP_MS],
        loop=0,
        optimize=False,
        disposal=1,
    )
    print(f"Wrote {GIF_OUT} (3 × {STEP_MS} ms — README embed)")


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
            page.wait_for_timeout(STEP_MS * 3 + 500)
            context.close()
            browser.close()

        videos = sorted(tmp.glob("*.webm"))
        if not videos:
            raise RuntimeError("No WebM recording produced")
        shutil.copy(videos[-1], WEBM_OUT)
        print(f"Wrote {WEBM_OUT}")
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def webm_to_mp4() -> None:
    ffmpeg = ffmpeg_exe()
    cycle_s = f"{(STEP_MS * 3) / 1000:.3f}"
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(WEBM_OUT),
            "-t",
            cycle_s,
            "-an",
            "-c:v",
            "libx264",
            "-pix_fmt",
            "yuv420p",
            "-movflags",
            "+faststart",
            str(MP4_OUT),
        ],
        check=True,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    print(f"Wrote {MP4_OUT} ({cycle_s}s — local / download)")


def main() -> None:
    live_url = HTML.as_uri()
    capture_url = live_url + "?capture=1"

    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page(
            viewport={"width": 920, "height": 1400},
            device_scale_factor=1.5,
        )
        page.goto(capture_url, wait_until="networkidle")
        write_gif(capture_gif_frames(page))
        browser.close()

    capture_webm(live_url)
    webm_to_mp4()


if __name__ == "__main__":
    main()
