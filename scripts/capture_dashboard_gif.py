#!/usr/bin/env python3
"""Record docs/daily-performance-report.html at real time (same 2.2s JS timer as Canvas)."""

import shutil
import subprocess
import tempfile
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
HTML = ROOT / "docs" / "daily-performance-report.html"
WEBM_OUT = ROOT / "docs" / "daily-performance-report.webm"
MP4_OUT = ROOT / "docs" / "daily-performance-report.mp4"

STEP_MS = 2200  # must match canvases/ewr-performance-dashboard.canvas.tsx + HTML setInterval


def ffmpeg_exe() -> str:
    try:
        import imageio_ffmpeg

        return imageio_ffmpeg.get_ffmpeg_exe()
    except ImportError as e:
        raise SystemExit("Install imageio-ffmpeg: python3 -m pip install imageio-ffmpeg") from e


def capture_webm(page_url: str) -> Path:
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
            # One full pipeline cycle at native setInterval(2200) — same as Canvas.
            page.wait_for_timeout(STEP_MS * 3 + 500)
            context.close()
            browser.close()

        videos = sorted(tmp.glob("*.webm"))
        if not videos:
            raise RuntimeError("No WebM recording produced")
        shutil.copy(videos[-1], WEBM_OUT)
        print(f"Wrote {WEBM_OUT}")
        return WEBM_OUT
    finally:
        shutil.rmtree(tmp, ignore_errors=True)


def webm_to_mp4(webm: Path) -> None:
    ffmpeg = ffmpeg_exe()
    cycle_s = f"{(STEP_MS * 3) / 1000:.3f}"
    subprocess.run(
        [
            ffmpeg,
            "-y",
            "-i",
            str(webm),
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
    print(f"Wrote {MP4_OUT}")


def main() -> None:
    capture_webm(HTML.as_uri())
    webm_to_mp4(WEBM_OUT)


if __name__ == "__main__":
    main()
