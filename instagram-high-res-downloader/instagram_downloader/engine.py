"""gallery-dl subprocess wrapper for high-resolution Instagram downloads."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from enum import Enum, auto
from pathlib import Path
from typing import Callable


class DownloadState(Enum):
    IDLE = auto()
    RUNNING = auto()
    CANCELLED = auto()
    COMPLETED = auto()
    FAILED = auto()


@dataclass
class DownloadResult:
    """Aggregate outcome of a download session."""

    state: DownloadState = DownloadState.IDLE
    successful: int = 0
    failed: int = 0
    skipped: int = 0
    messages: list[str] = field(default_factory=list)
    return_code: int | None = None


LogCallback = Callable[[str], None]
ProgressCallback = Callable[[int, int | None], None]  # (current, total_or_None)
DoneCallback = Callable[[DownloadResult], None]


def find_gallery_dl() -> str | None:
    """
    Locate a gallery-dl executable.

    Prefers an on-PATH binary, then falls back to ``python -m gallery_dl``.
    """
    binary = shutil.which("gallery-dl")
    if binary:
        return binary

    # Try the same interpreter's module form.
    try:
        proc = subprocess.run(
            [sys.executable, "-m", "gallery_dl", "--version"],
            capture_output=True,
            text=True,
            timeout=10,
            check=False,
        )
        if proc.returncode == 0:
            return "module"
    except (OSError, subprocess.TimeoutExpired):
        pass
    return None


def gallery_dl_available() -> bool:
    return find_gallery_dl() is not None


def build_gallery_dl_command(
    urls: list[str],
    destination: str | Path,
    *,
    jobs: int = 4,
    cookies_from_browser: str | None = None,
) -> list[str]:
    """
    Build a gallery-dl CLI invocation that:

    - Saves into *destination* exactly (``-D`` / ``--directory``)
    - Prefers original / highest quality media
    - Uses sensible filenames (username + shortcode / id)
    - Optionally loads browser cookies (often required by Instagram)
    - Runs a modest amount of concurrency
    """
    dest = str(Path(destination).expanduser().resolve())
    locator = find_gallery_dl()
    if locator is None:
        raise FileNotFoundError(
            "gallery-dl was not found. Install it with: pip install gallery-dl"
        )

    if locator == "module":
        cmd: list[str] = [sys.executable, "-m", "gallery_dl"]
    else:
        cmd = [locator]

    # Exact destination folder (no category subfolders).
    # -D / --directory writes files directly into PATH.
    cmd.extend(["-D", dest])

    # Filename: username + shortcode/media id when available.
    cmd.extend(
        [
            "-o",
            "filename={username|instagram}_{shortcode|media_id}.{extension}",
        ]
    )

    # Download videos (default True) — keep DASH for best quality when available.
    cmd.extend(["-o", "videos=true"])

    # Skip files that already exist (by name) instead of re-downloading.
    cmd.extend(["-o", "skip=name"])

    # Browser cookies help with login walls, rate limits, and private content.
    browser = (cookies_from_browser or "").strip().lower()
    if browser and browser not in {"", "none", "off"}:
        cmd.extend(["--cookies-from-browser", browser])

    # Concurrency: gallery-dl's -j / --jobs
    # Keep Instagram modest by default to reduce rate-limit risk.
    if jobs and jobs > 1:
        cmd.extend(["-j", str(jobs)])

    # Verbose enough for a live log without drowning in debug noise.
    cmd.append("-v")

    cmd.extend(urls)
    return cmd


class DownloadEngine:
    """
    Runs gallery-dl in a background thread and streams stdout/stderr to the UI.

    Call :meth:`start` to begin and :meth:`cancel` to terminate early.
    """

    def __init__(self) -> None:
        self._proc: subprocess.Popen[str] | None = None
        self._thread: threading.Thread | None = None
        self._cancel_event = threading.Event()
        self.state = DownloadState.IDLE
        self.result = DownloadResult()

    @property
    def is_running(self) -> bool:
        return self.state == DownloadState.RUNNING

    def start(
        self,
        urls: list[str],
        destination: str | Path,
        *,
        on_log: LogCallback | None = None,
        on_progress: ProgressCallback | None = None,
        on_done: DoneCallback | None = None,
        jobs: int = 2,
        cookies_from_browser: str | None = None,
    ) -> None:
        if self.is_running:
            raise RuntimeError("A download is already in progress.")

        dest = Path(destination).expanduser()
        if not dest.exists() or not dest.is_dir():
            raise NotADirectoryError(f"Destination is not a folder: {dest}")
        if not os.access(dest, os.W_OK):
            raise PermissionError(f"Destination is not writable: {dest}")
        if not urls:
            raise ValueError("No URLs provided.")

        self._cancel_event.clear()
        self.state = DownloadState.RUNNING
        self.result = DownloadResult(state=DownloadState.RUNNING)

        def _runner() -> None:
            result = DownloadResult(state=DownloadState.RUNNING)
            try:
                cmd = build_gallery_dl_command(
                    urls,
                    dest,
                    jobs=jobs,
                    cookies_from_browser=cookies_from_browser,
                )
                if on_log:
                    on_log(
                        f"$ {' '.join(_shell_quote(c) for c in cmd[:8])} … ({len(urls)} URL(s))"
                    )
                    on_log(f"Destination: {dest.resolve()}")
                    if cookies_from_browser:
                        on_log(f"Cookies: from browser ({cookies_from_browser})")
                    on_log("—")

                self._proc = subprocess.Popen(
                    cmd,
                    stdout=subprocess.PIPE,
                    stderr=subprocess.STDOUT,
                    text=True,
                    bufsize=1,
                    universal_newlines=True,
                )

                assert self._proc.stdout is not None
                completed = 0
                for line in self._proc.stdout:
                    if self._cancel_event.is_set():
                        break
                    text = line.rstrip("\n")
                    if not text:
                        continue
                    success, failed, skipped = _classify_line(text)
                    if success:
                        result.successful += 1
                        completed += 1
                    elif failed:
                        result.failed += 1
                        completed += 1
                    elif skipped:
                        result.skipped += 1
                        completed += 1
                    if on_log:
                        on_log(text)
                    if on_progress:
                        on_progress(completed, None)

                if self._cancel_event.is_set():
                    self._terminate_process()
                    result.state = DownloadState.CANCELLED
                    if on_log:
                        on_log("Download cancelled by user.")
                else:
                    code = self._proc.wait()
                    result.return_code = code
                    if code == 0 or result.successful > 0:
                        result.state = DownloadState.COMPLETED
                    else:
                        result.state = DownloadState.FAILED
                        if on_log and result.successful == 0 and result.failed == 0:
                            on_log(
                                "gallery-dl exited with an error. "
                                "Instagram often requires browser cookies — "
                                "try selecting Chrome/Firefox in Settings, "
                                "or check for private content / rate limits."
                            )
            except FileNotFoundError as exc:
                result.state = DownloadState.FAILED
                result.failed += 1
                if on_log:
                    on_log(f"Error: {exc}")
            except PermissionError as exc:
                result.state = DownloadState.FAILED
                result.failed += 1
                if on_log:
                    on_log(f"Permission error: {exc}")
            except Exception as exc:  # noqa: BLE001 — surface unexpected errors in the log
                result.state = DownloadState.FAILED
                result.failed += 1
                if on_log:
                    on_log(f"Unexpected error: {exc}")
            finally:
                self._proc = None
                self.state = result.state
                self.result = result
                if on_done:
                    on_done(result)

        self._thread = threading.Thread(
            target=_runner, name="gallery-dl-runner", daemon=True
        )
        self._thread.start()

    def cancel(self) -> None:
        """Request cancellation; the runner terminates the subprocess."""
        if not self.is_running:
            return
        self._cancel_event.set()
        self._terminate_process()

    def _terminate_process(self) -> None:
        proc = self._proc
        if proc is None:
            return
        try:
            proc.terminate()
            try:
                proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                proc.kill()
        except OSError:
            pass


def _classify_line(line: str) -> tuple[bool, bool, bool]:
    """
    Heuristic classification of gallery-dl output lines.

    Returns (success, failed, skipped).
    """
    lower = line.lower()
    if line.startswith("# ") or line.startswith("#\t"):
        return True, False, False
    if "download failed" in lower or "httperror" in lower or " 404 " in lower:
        return False, True, False
    if "login required" in lower or "401 unauthorized" in lower:
        return False, True, False
    if "unsupported url" in lower or "unable to download" in lower:
        return False, True, False
    if "skipped" in lower or "already exists" in lower:
        return False, False, True
    return False, False, False


def _shell_quote(value: str) -> str:
    if not value or any(c.isspace() for c in value) or any(
        c in value for c in "\"'`$&|;<>"
    ):
        return f'"{value}"'
    return value
