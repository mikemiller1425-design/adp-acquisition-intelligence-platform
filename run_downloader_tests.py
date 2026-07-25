#!/usr/bin/env python3
"""Run unit tests for all high-res downloader packages (isolated per package)."""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
PACKAGES = [
    "facebook-high-res-downloader",
    "instagram-high-res-downloader",
    "vsco-high-res-downloader",
]


def main() -> int:
    overall = 0
    for name in PACKAGES:
        pkg = ROOT / name
        print(f"========== {name} ==========", flush=True)
        proc = subprocess.run(
            [sys.executable, "-m", "unittest", "discover", "-s", "tests", "-v"],
            cwd=pkg,
            env={**dict(**{k: v for k, v in __import__("os").environ.items()}), "PYTHONPATH": str(pkg)},
            check=False,
        )
        if proc.returncode != 0:
            overall = 1
        print(flush=True)
    return overall


if __name__ == "__main__":
    raise SystemExit(main())
