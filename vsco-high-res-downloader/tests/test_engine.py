"""Deep unit tests for VSCO gallery-dl engine helpers and runner."""

from __future__ import annotations

import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from vsco_downloader.engine import (
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
        for line in (
            "Download failed",
            "HttpError: boom",
            " 404 ",
            "Unsupported URL",
            "Unable to download",
        ):
            with self.subTest(line=line):
                self.assertEqual(_classify_line(line), (False, True, False))

    def test_skipped_and_neutral(self) -> None:
        self.assertEqual(_classify_line("skipped"), (False, False, True))
        self.assertEqual(_classify_line("already exists"), (False, False, True))
        self.assertEqual(_classify_line("login required"), (False, False, False))  # VSCO heuristic
        self.assertEqual(_classify_line("[debug]"), (False, False, False))


class ShellQuoteTests(unittest.TestCase):
    def test_rules(self) -> None:
        self.assertEqual(_shell_quote("x"), "x")
        self.assertEqual(_shell_quote("x y"), '"x y"')
        self.assertEqual(_shell_quote(""), '""')
        self.assertEqual(_shell_quote("a>b"), '"a>b"')


class BuildCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        if find_gallery_dl() is None:
            self.skipTest("gallery-dl not installed")

    def test_core_flags(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cmd = build_gallery_dl_command(["https://vsco.co/a"], tmp, jobs=1)
            self.assertIn("-D", cmd)
            self.assertEqual(cmd[cmd.index("-D") + 1], str(Path(tmp).resolve()))
            self.assertNotIn("-j", cmd)
            joined = " ".join(cmd)
            self.assertIn("filename={username|vsco}_{id}.{extension}", joined)
            self.assertIn("skip=name", joined)
            self.assertIn("-v", cmd)
            # VSCO builder has no cookies flag
            self.assertNotIn("--cookies-from-browser", cmd)

    def test_defaultish_jobs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cmd = build_gallery_dl_command(["https://vsco.co/a"], tmp, jobs=4)
            self.assertEqual(cmd[cmd.index("-j") + 1], "4")

    def test_urls_and_missing_binary(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            urls = ["https://vsco.co/a", "https://vsco.co/b"]
            self.assertEqual(build_gallery_dl_command(urls, tmp)[-2:], urls)
        with patch("vsco_downloader.engine.find_gallery_dl", return_value=None):
            with self.assertRaises(FileNotFoundError):
                build_gallery_dl_command(["https://vsco.co/a"], "/tmp")

    def test_module_locator(self) -> None:
        with patch("vsco_downloader.engine.find_gallery_dl", return_value="module"):
            with tempfile.TemporaryDirectory() as tmp:
                cmd = build_gallery_dl_command(["https://vsco.co/a"], tmp)
                self.assertEqual(cmd[1:3], ["-m", "gallery_dl"])


class FindGalleryDlTests(unittest.TestCase):
    def test_available(self) -> None:
        self.assertEqual(gallery_dl_available(), find_gallery_dl() is not None)

    def test_which_and_fallback(self) -> None:
        with patch("vsco_downloader.engine.shutil.which", return_value="/bin/gallery-dl"):
            self.assertEqual(find_gallery_dl(), "/bin/gallery-dl")
        with patch("vsco_downloader.engine.shutil.which", return_value=None):
            with patch("vsco_downloader.engine.subprocess.run") as run:
                run.return_value = MagicMock(returncode=0)
                self.assertEqual(find_gallery_dl(), "module")


class DownloadEngineTests(unittest.TestCase):
    def test_input_validation(self) -> None:
        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                eng.start([], tmp)
        with self.assertRaises(NotADirectoryError):
            eng.start(["https://vsco.co/a"], "/tmp/no-such-vsco-dest-zzz")

    def test_unwritable_destination(self) -> None:
        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            os.chmod(tmp, 0o555)
            try:
                if os.access(tmp, os.W_OK):
                    self.skipTest("writable despite 0555")
                with self.assertRaises(PermissionError):
                    eng.start(["https://vsco.co/a"], tmp)
            finally:
                os.chmod(tmp, 0o755)

    def test_runner_counts(self) -> None:
        done = threading.Event()
        holder: dict = {}

        class FakeProc:
            def __init__(self, *a, **k):
                self.stdout = iter(
                    [
                        "# /tmp/a.jpg\n",
                        "Download failed: x\n",
                        "skipped\n",
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
            with patch("vsco_downloader.engine.subprocess.Popen", FakeProc):
                with patch(
                    "vsco_downloader.engine.build_gallery_dl_command",
                    return_value=["gallery-dl", "x"],
                ):
                    eng.start(
                        ["https://vsco.co/a"],
                        tmp,
                        on_done=lambda r: (holder.setdefault("r", r), done.set()),
                    )
                    self.assertTrue(done.wait(5))
        r = holder["r"]
        self.assertEqual((r.successful, r.failed, r.skipped), (1, 1, 1))
        self.assertEqual(r.state, DownloadState.COMPLETED)

    def test_failed_exit_message(self) -> None:
        done = threading.Event()
        holder: dict = {}
        logs: list[str] = []

        class FakeProc:
            def __init__(self, *a, **k):
                self.stdout = iter(["[vsco][error] mysterious\n"])

            def wait(self, timeout=None):
                return 1

            def terminate(self):
                pass

            def kill(self):
                pass

        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            with patch("vsco_downloader.engine.subprocess.Popen", FakeProc):
                with patch(
                    "vsco_downloader.engine.build_gallery_dl_command",
                    return_value=["gallery-dl", "x"],
                ):
                    eng.start(
                        ["https://vsco.co/a"],
                        tmp,
                        on_log=logs.append,
                        on_done=lambda r: (holder.setdefault("r", r), done.set()),
                    )
                    self.assertTrue(done.wait(5))
        self.assertEqual(holder["r"].state, DownloadState.FAILED)
        self.assertTrue(any("gallery-dl exited with an error" in line for line in logs))

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
            with patch("vsco_downloader.engine.subprocess.Popen", FakeProc):
                with patch(
                    "vsco_downloader.engine.build_gallery_dl_command",
                    return_value=["gallery-dl", "x"],
                ):
                    eng.start(
                        ["https://vsco.co/a"],
                        tmp,
                        on_done=lambda r: (holder.setdefault("r", r), done.set()),
                    )
                    threading.Event().wait(0.05)
                    eng.cancel()
                    self.assertTrue(done.wait(5))
        self.assertEqual(holder["r"].state, DownloadState.CANCELLED)

    def test_build_error_failed(self) -> None:
        done = threading.Event()
        holder: dict = {}
        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            with patch(
                "vsco_downloader.engine.build_gallery_dl_command",
                side_effect=FileNotFoundError("missing"),
            ):
                eng.start(
                    ["https://vsco.co/a"],
                    tmp,
                    on_done=lambda r: (holder.setdefault("r", r), done.set()),
                )
                self.assertTrue(done.wait(5))
        self.assertEqual(holder["r"].state, DownloadState.FAILED)


if __name__ == "__main__":
    unittest.main()
