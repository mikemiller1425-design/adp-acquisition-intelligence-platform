"""Lightweight unit tests for URL validation (no GUI / display required)."""

from __future__ import annotations

import unittest

from facebook_downloader.validators import (
    extract_facebook_urls,
    is_valid_facebook_url,
    normalize_url,
)


class ValidatorTests(unittest.TestCase):
    def test_valid_photo_url(self) -> None:
        url = "https://www.facebook.com/photo/?fbid=1234567890"
        self.assertTrue(is_valid_facebook_url(url))

    def test_valid_watch_video_and_profile(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/watch/?v=987654321"))
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/natgeo/videos/111"))
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/natgeo"))
        self.assertTrue(is_valid_facebook_url("https://fb.watch/AbCdEf/"))

    def test_trailing_junk(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/photo/?fbid=123),"))
        self.assertEqual(
            normalize_url("https://www.facebook.com/photo/?fbid=123),"),
            "https://www.facebook.com/photo/?fbid=123",
        )

    def test_rejects_non_facebook(self) -> None:
        self.assertFalse(is_valid_facebook_url("https://instagram.com/alice"))
        self.assertFalse(is_valid_facebook_url("https://www.facebook.com/"))
        self.assertFalse(is_valid_facebook_url("https://www.facebook.com/login"))
        self.assertFalse(is_valid_facebook_url("not a url"))

    def test_extract_unique_preserving_order(self) -> None:
        text = """
        check these:
        https://www.facebook.com/photo/?fbid=111
        https://www.facebook.com/natgeo
        https://www.facebook.com/photo/?fbid=111
        https://example.com/nope
        """
        urls = extract_facebook_urls(text)
        self.assertEqual(
            urls,
            [
                "https://www.facebook.com/photo/?fbid=111",
                "https://www.facebook.com/natgeo",
            ],
        )

    def test_dedupe_www_and_mobile(self) -> None:
        text = (
            "https://facebook.com/natgeo\n"
            "https://www.facebook.com/natgeo\n"
            "https://m.facebook.com/natgeo\n"
        )
        urls = extract_facebook_urls(text)
        self.assertEqual(len(urls), 1)


class EngineCommandTests(unittest.TestCase):
    def test_command_includes_destination_and_urls(self) -> None:
        from facebook_downloader.engine import build_gallery_dl_command, find_gallery_dl

        if find_gallery_dl() is None:
            self.skipTest("gallery-dl not installed")

        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            cmd = build_gallery_dl_command(
                ["https://www.facebook.com/photo/?fbid=123"],
                tmp,
                jobs=2,
                cookies_from_browser="chrome",
            )
            self.assertIn("-D", cmd)
            self.assertIn(str(Path(tmp).resolve()), cmd)
            self.assertIn("-j", cmd)
            self.assertIn("2", cmd)
            self.assertIn("--cookies-from-browser", cmd)
            self.assertIn("chrome", cmd)
            self.assertIn("https://www.facebook.com/photo/?fbid=123", cmd)


if __name__ == "__main__":
    unittest.main()
