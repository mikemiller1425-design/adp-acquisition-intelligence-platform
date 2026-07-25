"""Deep unit tests for Facebook gallery-dl engine helpers and runner."""

from __future__ import annotations

import os
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from facebook_downloader.engine import (
    DownloadEngine,
    DownloadState,
    _classify_line,
    _shell_quote,
    build_gallery_dl_command,
    find_gallery_dl,
    gallery_dl_available,
)


class ClassifyLineTests(unittest.TestCase):
    def test_success_hash_space(self) -> None:
        self.assertEqual(_classify_line("# /tmp/out/photo.jpg"), (True, False, False))

    def test_success_hash_tab(self) -> None:
        self.assertEqual(_classify_line("#\t/tmp/out/photo.jpg"), (True, False, False))

    def test_failed_download_failed(self) -> None:
        self.assertEqual(_classify_line("Download failed: timeout"), (False, True, False))

    def test_failed_httperror(self) -> None:
        self.assertEqual(
            _classify_line("[facebook][error] HttpError: '403 Forbidden'"),
            (False, True, False),
        )

    def test_failed_404(self) -> None:
        self.assertEqual(_classify_line("got 404 Not Found from server"), (False, True, False))

    def test_failed_login_required(self) -> None:
        self.assertEqual(_classify_line("Login required for this content"), (False, True, False))

    def test_failed_401(self) -> None:
        self.assertEqual(_classify_line("401 Unauthorized"), (False, True, False))

    def test_failed_unsupported_url(self) -> None:
        self.assertEqual(_classify_line("Unsupported URL 'x'"), (False, True, False))

    def test_failed_unable_to_download(self) -> None:
        self.assertEqual(_classify_line("Unable to download file"), (False, True, False))

    def test_skipped_keyword(self) -> None:
        self.assertEqual(_classify_line("[facebook][info] skipped file"), (False, False, True))

    def test_skipped_already_exists(self) -> None:
        self.assertEqual(_classify_line("file already exists"), (False, False, True))

    def test_neutral_noise(self) -> None:
        self.assertEqual(_classify_line("[facebook][debug] starting"), (False, False, False))
        self.assertEqual(_classify_line(""), (False, False, False))
        self.assertEqual(_classify_line("#noleadingspace"), (False, False, False))


class ShellQuoteTests(unittest.TestCase):
    def test_plain(self) -> None:
        self.assertEqual(_shell_quote("gallery-dl"), "gallery-dl")

    def test_spaces(self) -> None:
        self.assertEqual(_shell_quote("/tmp/my folder"), '"/tmp/my folder"')

    def test_empty(self) -> None:
        self.assertEqual(_shell_quote(""), '""')

    def test_shell_metacharacters(self) -> None:
        self.assertEqual(_shell_quote("a&b"), '"a&b"')
        self.assertEqual(_shell_quote("a$b"), '"a$b"')
        self.assertEqual(_shell_quote("a;b"), '"a;b"')


class BuildCommandTests(unittest.TestCase):
    def setUp(self) -> None:
        if find_gallery_dl() is None:
            self.skipTest("gallery-dl not installed")

    def test_destination_flag_and_resolved_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cmd = build_gallery_dl_command(
                ["https://www.facebook.com/photo/?fbid=1"],
                tmp,
                jobs=1,
            )
            self.assertIn("-D", cmd)
            dest_idx = cmd.index("-D") + 1
            self.assertEqual(cmd[dest_idx], str(Path(tmp).resolve()))
            self.assertIn("https://www.facebook.com/photo/?fbid=1", cmd)
            self.assertIn("-v", cmd)
            self.assertNotIn("-j", cmd)  # jobs=1 omits concurrency flag

    def test_jobs_flag_when_greater_than_one(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cmd = build_gallery_dl_command(
                ["https://www.facebook.com/a"],
                tmp,
                jobs=3,
            )
            self.assertIn("-j", cmd)
            self.assertEqual(cmd[cmd.index("-j") + 1], "3")

    def test_filename_and_video_options(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cmd = build_gallery_dl_command(["https://www.facebook.com/a"], tmp)
            joined = " ".join(cmd)
            self.assertIn("filename={username|facebook}_{id}.{extension}", joined)
            self.assertIn("videos=true", joined)
            self.assertIn("skip=name", joined)

    def test_cookies_added_for_real_browser(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cmd = build_gallery_dl_command(
                ["https://www.facebook.com/a"],
                tmp,
                cookies_from_browser="Chrome",
            )
            self.assertIn("--cookies-from-browser", cmd)
            self.assertIn("chrome", cmd)

    def test_cookies_ignored_for_none_off_blank(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            for value in (None, "", "none", "None", "off", "  OFF  "):
                with self.subTest(value=value):
                    cmd = build_gallery_dl_command(
                        ["https://www.facebook.com/a"],
                        tmp,
                        cookies_from_browser=value,
                    )
                    self.assertNotIn("--cookies-from-browser", cmd)

    def test_multiple_urls_appended_in_order(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            urls = [
                "https://www.facebook.com/a",
                "https://www.facebook.com/b",
                "https://fb.watch/x/",
            ]
            cmd = build_gallery_dl_command(urls, tmp)
            self.assertEqual(cmd[-3:], urls)

    def test_raises_when_gallery_dl_missing(self) -> None:
        with patch("facebook_downloader.engine.find_gallery_dl", return_value=None):
            with self.assertRaises(FileNotFoundError):
                build_gallery_dl_command(["https://www.facebook.com/a"], "/tmp")

    def test_module_locator_uses_python_m(self) -> None:
        with patch("facebook_downloader.engine.find_gallery_dl", return_value="module"):
            with tempfile.TemporaryDirectory() as tmp:
                cmd = build_gallery_dl_command(["https://www.facebook.com/a"], tmp)
                self.assertEqual(cmd[0], __import__("sys").executable)
                self.assertEqual(cmd[1:3], ["-m", "gallery_dl"])


class FindGalleryDlTests(unittest.TestCase):
    def test_available_matches_finder(self) -> None:
        self.assertEqual(gallery_dl_available(), find_gallery_dl() is not None)

    def test_which_preferred(self) -> None:
        with patch("facebook_downloader.engine.shutil.which", return_value="/bin/gallery-dl"):
            self.assertEqual(find_gallery_dl(), "/bin/gallery-dl")

    def test_falls_back_to_module(self) -> None:
        with patch("facebook_downloader.engine.shutil.which", return_value=None):
            with patch("facebook_downloader.engine.subprocess.run") as run:
                run.return_value = MagicMock(returncode=0)
                self.assertEqual(find_gallery_dl(), "module")

    def test_none_when_module_fails(self) -> None:
        with patch("facebook_downloader.engine.shutil.which", return_value=None):
            with patch("facebook_downloader.engine.subprocess.run") as run:
                run.return_value = MagicMock(returncode=1)
                self.assertIsNone(find_gallery_dl())


class DownloadEngineValidationTests(unittest.TestCase):
    def test_rejects_empty_urls(self) -> None:
        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaises(ValueError):
                eng.start([], tmp)

    def test_rejects_missing_destination(self) -> None:
        eng = DownloadEngine()
        with self.assertRaises(NotADirectoryError):
            eng.start(["https://www.facebook.com/a"], "/tmp/definitely-missing-fb-dest-xyz")

    def test_rejects_file_as_destination(self) -> None:
        eng = DownloadEngine()
        with tempfile.NamedTemporaryFile() as fh:
            with self.assertRaises(NotADirectoryError):
                eng.start(["https://www.facebook.com/a"], fh.name)

    def test_rejects_unwritable_destination(self) -> None:
        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            os.chmod(tmp, 0o555)
            try:
                # Root can still write; skip if access check passes.
                if os.access(tmp, os.W_OK):
                    self.skipTest("environment allows write despite 0555")
                with self.assertRaises(PermissionError):
                    eng.start(["https://www.facebook.com/a"], tmp)
            finally:
                os.chmod(tmp, 0o755)

    def test_cancel_when_idle_is_noop(self) -> None:
        eng = DownloadEngine()
        eng.cancel()
        self.assertFalse(eng.is_running)
        self.assertEqual(eng.state, DownloadState.IDLE)


class DownloadEngineRunnerTests(unittest.TestCase):
    def _run_with_lines(
        self,
        lines: list[str],
        *,
        returncode: int = 0,
        cookies: str | None = "chrome",
    ):
        done = threading.Event()
        holder: dict = {}
        logs: list[str] = []
        progress: list[int] = []

        class FakeProc:
            def __init__(self, *args, **kwargs):
                self.stdout = iter(lines)
                self._code = returncode

            def wait(self, timeout=None):
                return self._code

            def terminate(self):
                pass

            def kill(self):
                pass

        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            with patch("facebook_downloader.engine.subprocess.Popen", FakeProc):
                with patch(
                    "facebook_downloader.engine.build_gallery_dl_command",
                    return_value=["gallery-dl", "-D", tmp, "https://www.facebook.com/a"],
                ):
                    eng.start(
                        ["https://www.facebook.com/a"],
                        tmp,
                        cookies_from_browser=cookies,
                        on_log=logs.append,
                        on_progress=lambda cur, _tot: progress.append(cur),
                        on_done=lambda r: (holder.setdefault("r", r), done.set()),
                    )
                    self.assertTrue(done.wait(5), "engine did not finish")
        return holder["r"], logs, progress, eng

    def test_counts_success_fail_skip_and_completes(self) -> None:
        result, logs, progress, eng = self._run_with_lines(
            [
                "# /tmp/a.jpg\n",
                "[facebook][error] HttpError: '404 Not Found'\n",
                "file already exists\n",
                "[facebook][debug] noise\n",
                "\n",
            ]
        )
        self.assertEqual(result.successful, 1)
        self.assertEqual(result.failed, 1)
        self.assertEqual(result.skipped, 1)
        self.assertEqual(result.state, DownloadState.COMPLETED)
        self.assertEqual(result.return_code, 0)
        self.assertFalse(eng.is_running)
        self.assertIn("Cookies: from browser (chrome)", "\n".join(logs))
        # Progress is emitted for every non-empty log line; neutral noise
        # re-reports the current completed count without incrementing it.
        self.assertEqual(progress, [1, 2, 3, 3])

    def test_failed_when_nonzero_and_no_successes(self) -> None:
        result, logs, _, _ = self._run_with_lines(
            ["[facebook][error] boom\n"],
            returncode=1,
            cookies=None,
        )
        # "boom" is not classified as failed by heuristic → failed count may be 0
        self.assertEqual(result.state, DownloadState.FAILED)
        self.assertTrue(any("gallery-dl exited with an error" in line for line in logs))

    def test_completed_when_nonzero_but_had_success(self) -> None:
        result, _, _, _ = self._run_with_lines(
            ["# /tmp/a.jpg\n", "[facebook][error] HttpError: x\n"],
            returncode=1,
        )
        self.assertEqual(result.successful, 1)
        self.assertEqual(result.state, DownloadState.COMPLETED)

    def test_double_start_raises(self) -> None:
        eng = DownloadEngine()
        gate = threading.Event()
        started = threading.Event()

        class BlockingStdout:
            def __iter__(self):
                started.set()
                gate.wait(2)
                if False:  # pragma: no cover
                    yield ""

        class FakeProc:
            def __init__(self, *args, **kwargs):
                self.stdout = BlockingStdout()

            def wait(self, timeout=None):
                return 0

            def terminate(self):
                gate.set()

            def kill(self):
                gate.set()

        with tempfile.TemporaryDirectory() as tmp:
            with patch("facebook_downloader.engine.subprocess.Popen", FakeProc):
                with patch(
                    "facebook_downloader.engine.build_gallery_dl_command",
                    return_value=["gallery-dl", "x"],
                ):
                    eng.start(["https://www.facebook.com/a"], tmp)
                    self.assertTrue(started.wait(2))
                    with self.assertRaises(RuntimeError):
                        eng.start(["https://www.facebook.com/b"], tmp)
                    eng.cancel()
                    if eng._thread:
                        eng._thread.join(timeout=3)

    def test_cancel_marks_cancelled(self) -> None:
        done = threading.Event()
        holder: dict = {}
        release = threading.Event()

        class SlowStdout:
            def __iter__(self):
                yield "# /tmp/a.jpg\n"
                release.wait(2)
                yield "# /tmp/b.jpg\n"

        class FakeProc:
            def __init__(self, *args, **kwargs):
                self.stdout = SlowStdout()
                self.terminated = False

            def wait(self, timeout=None):
                return 0

            def terminate(self):
                self.terminated = True
                release.set()

            def kill(self):
                release.set()

        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            with patch("facebook_downloader.engine.subprocess.Popen", FakeProc):
                with patch(
                    "facebook_downloader.engine.build_gallery_dl_command",
                    return_value=["gallery-dl", "x"],
                ):
                    eng.start(
                        ["https://www.facebook.com/a"],
                        tmp,
                        on_done=lambda r: (holder.setdefault("r", r), done.set()),
                    )
                    # Let first line process, then cancel.
                    threading.Event().wait(0.05)
                    eng.cancel()
                    self.assertTrue(done.wait(5))
        self.assertEqual(holder["r"].state, DownloadState.CANCELLED)
        self.assertGreaterEqual(holder["r"].successful, 1)

    def test_build_error_surfaces_as_failed(self) -> None:
        done = threading.Event()
        holder: dict = {}
        logs: list[str] = []
        eng = DownloadEngine()
        with tempfile.TemporaryDirectory() as tmp:
            with patch(
                "facebook_downloader.engine.build_gallery_dl_command",
                side_effect=FileNotFoundError("gallery-dl was not found"),
            ):
                eng.start(
                    ["https://www.facebook.com/a"],
                    tmp,
                    on_log=logs.append,
                    on_done=lambda r: (holder.setdefault("r", r), done.set()),
                )
                self.assertTrue(done.wait(5))
        self.assertEqual(holder["r"].state, DownloadState.FAILED)
        self.assertTrue(any("gallery-dl was not found" in line for line in logs))


if __name__ == "__main__":
    unittest.main()
