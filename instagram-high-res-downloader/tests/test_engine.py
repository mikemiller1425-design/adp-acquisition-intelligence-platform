"""Deep unit tests for Instagram gallery-dl engine helpers and runner."""

from __future__ import annotations

import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from instagram_downloader.engine import (
    DownloadEngine,
    DownloadState,
    _classify_line,
    _shell_quote,
    build_gallery_dl_command,
    find_gallery_dl,
    gallery_dl_available,
)


class ClassifyLineTests(unittest.TestCase):
    def test_success(self) -> None:
        self.assertEqual(_classify_line("# /tmp/a.jpg"), (True, False, False))
        self.assertEqual(_classify_line("#\t/tmp/a.jpg"), (True, False, False))

    def test_failures(self) -> None:
        cases = [
            "Download failed: x",
            "[instagram][error] HttpError: '403 Forbidden'",
            "got 404 Not Found",
            "Login required",
            "401 Unauthorized",
            "Unsupported URL",
            "Unable to download",
        ]
        for line in cases:
            with self.subTest(line=line):
                self.assertEqual(_classify_line(line), (False, True, False))

    def test_skipped_and_neutral(self) -> None:
        self.assertEqual(_classify_line("skipped"), (False, False, True))
        self.assertEqual(_classify_line("already exists"), (False, False, True))
        self.assertEqual(_classify_line("[debug] hi"), (False, False, False))


class ShellQuoteTests(unittest.TestCase):
    def test_quote_rules(self) -> None:
        self.assertEqual(_shell_quote("ok"), "ok")
        self.assertEqual(_shell_quote("a b"), '"a b"')
        self.assertEqual(_shell_quote(""), '""')
        self.assertEqual(_shell_quote("a|b"), '"a|b"')


class BuildCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        if find_gallery_dl() is None:
            self.skipTest("gallery-dl not installed")

    def test_core_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cmd = build_gallery_dl_command(
                ["https://www.instagram.com/p/ABC/"],
                tmp,
                jobs=1,
            )
            self.assertIn("-D", cmd)
            self.assertEqual(cmd[cmd.index("-D") + 1], str(Path(tmp).resolve()))
            self.assertNotIn("-j", cmd)
            joined = " ".join(cmd)
            self.assertIn("filename={username|instagram}_{shortcode|media_id}.{extension}", joined)
            self.assertIn("videos=true", joined)
            self.assertIn("skip=name", joined)
            self.assertIn("-v", cmd)

    def test_jobs_and_cookies(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cmd = build_gallery_dl_command(
                ["https://www.instagram.com/p/ABC/"],
                tmp,
                jobs=4,
                cookies_from_browser="Firefox",
            )
            self.assertEqual(cmd[cmd.index("-j") + 1], "4")
            self.assertIn("--cookies-from-browser", cmd)
            self.assertIn("firefox", cmd)

    def test_cookies_ignored_for_none_values(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            for value in (None, "", "none", "off"):
                cmd = build_gallery_dl_command(
                    ["https://www.instagram.com/p/ABC/"],
                    tmp,
                    cookies_from_browser=value,
                )
                self.assertNotIn("--cookies-from-browser", cmd)

    def test_urls_order_and_missing_binary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            urls = ["https://www.instagram.com/p/A/", "https://www.instagram.com/p/B/"]
            cmd = build_gallery_dl_command(urls, tmp)
            self.assertEqual(cmd[-2:], urls)
        with patch("instagram_downloader.engine.find_gallery_dl", return_value=None):
            with self.assertRaises(FileNotFoundError):
                build_gallery_dl_command(["https://www.instagram.com/p/A/"], "/tmp")

    def test_module_locator(self) -> None:
        with patch("instagram_downloader.engine.find_gallery_dl", return_value="module"):
            with tempfile.TemporaryDirectory() as tmp:
                cmd = build_gallery_dl_command(["https://www.instagram.com/p/A/"], tmp)
                self.assertEqual(cmd[1:3], ["-m", "gallery_dl"])


class FindGalleryDlTests(unittest.TestCase):
    def test_available(self) -> None:
        self.assertEqual(gallery_dl_available(), find_gallery_dl() is not None)

    def test_which_and_fallback(self) -> None:
        with patch("instagram_downloader.engine.shutil.which", return_value="/bin/gallery-dl"):
            self.assertEqual(find_gallery_dl(), "/bin/gallery-dl")
        with patch("instagram_downloader.engine.shutil.which", return_value=None):
            with patch("instagram_downloader.engine.subprocess.run") as run:
                run.return_value = MagicMock(returncode=0)
                self.assertEqual(find_gallery_dl(), "module")
            with patch("instagram_downloader.engine.subprocess.run") as run:
                run.return_value = MagicMock(returncode=2)
                self.assertIsNone(find_gallery_dl())


class DownloadEngineTests(unittest.TestCase):
    def test_input_validation(self) -> None:
        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                eng.start([], tmp)
        with self.assertRaises(NotADirectoryError):
            eng.start(["https://www.instagram.com/p/A/"], "/tmp/no-such-ig-dest-zzz")
        with tempfile.NamedTemporaryFile() as fh:
            with self.assertRaises(NotADirectoryError):
                eng.start(["https://www.instagram.com/p/A/"], fh.name)

    def test_unwritable_destination(self) -> None:
        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            os.chmod(tmp, 0o555)
            try:
                if os.access(tmp, os.W_OK):
                    self.skipTest("writable despite 0555")
                with self.assertRaises(PermissionError):
                    eng.start(["https://www.instagram.com/p/A/"], tmp)
            finally:
                os.chmod(tmp, 0o755)

    def test_cancel_idle_noop(self) -> None:
        eng = DownloadEngine()
        eng.cancel()
        self.assertEqual(eng.state, DownloadState.IDLE)

    def test_runner_counts_and_states(self) -> None:
        done = threading.Event()
        holder: dict = {}
        logs: list[str] = []

        class FakeProc:
            def __init__(self, *a, **k):
                self.stdout = iter(
                    [
                        "# /tmp/a.jpg\n",
                        "[instagram][error] HttpError: '404 Not Found'\n",
                        "already exists\n",
                    ]
                )

            def wait(self, timeout=None):
                return 0

            def terminate(self):
                pass

            def kill(self):
                pass

        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            with patch("instagram_downloader.engine.subprocess.Popen", FakeProc):
                with patch(
                    "instagram_downloader.engine.build_gallery_dl_command",
                    return_value=["gallery-dl", "x"],
                ):
                    eng.start(
                        ["https://www.instagram.com/p/A/"],
                        tmp,
                        cookies_from_browser="chrome",
                        on_log=logs.append,
                        on_done=lambda r: (holder.setdefault("r", r), done.set()),
                    )
                    self.assertTrue(done.wait(5))
        r = holder["r"]
        self.assertEqual((r.successful, r.failed, r.skipped), (1, 1, 1))
        self.assertEqual(r.state, DownloadState.COMPLETED)
        self.assertIn("Cookies: from browser (chrome)", "\n".join(logs))

    def test_failed_exit_without_success(self) -> None:
        done = threading.Event()
        holder: dict = {}
        logs: list[str] = []

        class FakeProc:
            def __init__(self, *a, **k):
                self.stdout = iter(["[instagram][error] mysterious\n"])

            def wait(self, timeout=None):
                return 1

            def terminate(self):
                pass

            def kill(self):
                pass

        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            with patch("instagram_downloader.engine.subprocess.Popen", FakeProc):
                with patch(
                    "instagram_downloader.engine.build_gallery_dl_command",
                    return_value=["gallery-dl", "x"],
                ):
                    eng.start(
                        ["https://www.instagram.com/p/A/"],
                        tmp,
                        on_log=logs.append,
                        on_done=lambda r: (holder.setdefault("r", r), done.set()),
                    )
                    self.assertTrue(done.wait(5))
        self.assertEqual(holder["r"].state, DownloadState.FAILED)
        self.assertTrue(any("browser cookies" in line.lower() for line in logs))

    def test_cancel_mid_run(self) -> None:
        done = threading.Event()
        holder: dict = {}
        release = threading.Event()

        class SlowStdout:
            def __iter__(self):
                yield "# /tmp/a.jpg\n"
                release.wait(2)
                yield "# /tmp/b.jpg\n"

        class FakeProc:
            def __init__(self, *a, **k):
                self.stdout = SlowStdout()

            def wait(self, timeout=None):
                return 0

            def terminate(self):
                release.set()

            def kill(self):
                release.set()

        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            with patch("instagram_downloader.engine.subprocess.Popen", FakeProc):
                with patch(
                    "instagram_downloader.engine.build_gallery_dl_command",
                    return_value=["gallery-dl", "x"],
                ):
                    eng.start(
                        ["https://www.instagram.com/p/A/"],
                        tmp,
                        on_done=lambda r: (holder.setdefault("r", r), done.set()),
                    )
                    threading.Event().wait(0.05)
                    eng.cancel()
                    self.assertTrue(done.wait(5))
        self.assertEqual(holder["r"].state, DownloadState.CANCELLED)

    def test_double_start_raises(self) -> None:
        eng = DownloadEngine()
        gate = threading.Event()
        started = threading.Event()

        class BlockingStdout:
            def __iter__(self):
                started.set()
                gate.wait(2)
                return
                yield  # pragma: no cover

        class FakeProc:
            def __init__(self, *a, **k):
                self.stdout = BlockingStdout()

            def wait(self, timeout=None):
                return 0

            def terminate(self):
                gate.set()

            def kill(self):
                gate.set()

        with tempfile.TemporaryDirectory() as tmp:
            with patch("instagram_downloader.engine.subprocess.Popen", FakeProc):
                with patch(
                    "instagram_downloader.engine.build_gallery_dl_command",
                    return_value=["gallery-dl", "x"],
                ):
                    eng.start(["https://www.instagram.com/p/A/"], tmp)
                    self.assertTrue(started.wait(2))
                    with self.assertRaises(RuntimeError):
                        eng.start(["https://www.instagram.com/p/B/"], tmp)
                    eng.cancel()
                    if eng._thread:
                        eng._thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
