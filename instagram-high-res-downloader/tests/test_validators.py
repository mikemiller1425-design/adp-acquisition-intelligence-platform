"""Lightweight unit tests for URL validation (no GUI / display required)."""

from __future__ import annotations

import unittest

from instagram_downloader.validators import (
    extract_instagram_urls,
    is_valid_instagram_url,
    normalize_url,
)


class ValidatorTests(unittest.TestCase):
    def test_valid_post_url(self) -> None:
        url = "https://www.instagram.com/p/AbCdEfGhIjK/"
        self.assertTrue(is_valid_instagram_url(url))

    def test_valid_reel_and_profile(self) -> None:
        self.assertTrue(is_valid_instagram_url("https://www.instagram.com/reel/AbCdEfGhIjK/"))
        self.assertTrue(is_valid_instagram_url("https://instagram.com/natgeo"))
        self.assertTrue(is_valid_instagram_url("https://www.instagram.com/stories/natgeo/123"))

    def test_short_domain_and_trailing_junk(self) -> None:
        self.assertTrue(is_valid_instagram_url("https://instagr.am/p/AbCdEfGhIjK),"))
        self.assertEqual(
            normalize_url("https://instagr.am/p/AbCdEfGhIjK),"),
            "https://instagr.am/p/AbCdEfGhIjK",
        )

    def test_rejects_non_instagram(self) -> None:
        self.assertFalse(is_valid_instagram_url("https://vsco.co/alice"))
        self.assertFalse(is_valid_instagram_url("https://www.instagram.com/"))
        self.assertFalse(is_valid_instagram_url("https://www.instagram.com/login"))
        self.assertFalse(is_valid_instagram_url("not a url"))

    def test_extract_unique_preserving_order(self) -> None:
        text = """
        check these:
        https://www.instagram.com/p/AAA/
        https://www.instagram.com/natgeo
        https://www.instagram.com/p/AAA/
        https://example.com/nope
        """
        urls = extract_instagram_urls(text)
        self.assertEqual(
            urls,
            [
                "https://www.instagram.com/p/AAA/",
                "https://www.instagram.com/natgeo",
            ],
        )

    def test_dedupe_www_and_bare_host(self) -> None:
        text = (
            "https://instagram.com/p/ABC/\n"
            "https://www.instagram.com/p/ABC/\n"
        )
        urls = extract_instagram_urls(text)
        self.assertEqual(len(urls), 1)


class EngineCommandTests(unittest.TestCase):
    def test_command_includes_destination_and_urls(self) -> None:
        from instagram_downloader.engine import build_gallery_dl_command, find_gallery_dl

        if find_gallery_dl() is None:
            self.skipTest("gallery-dl not installed")

        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            cmd = build_gallery_dl_command(
                ["https://www.instagram.com/p/ABC/"],
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
            self.assertIn("https://www.instagram.com/p/ABC/", cmd)


if __name__ == "__main__":
    unittest.main()
