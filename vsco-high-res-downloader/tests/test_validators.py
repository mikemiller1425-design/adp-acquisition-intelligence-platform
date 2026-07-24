"""Lightweight unit tests for URL validation (no GUI / display required)."""

from __future__ import annotations

import unittest

from vsco_downloader.validators import extract_vsco_urls, is_valid_vsco_url, normalize_url


class ValidatorTests(unittest.TestCase):
    def test_valid_media_url(self) -> None:
        url = "https://vsco.co/alice/media/1234567890abcdef"
        self.assertTrue(is_valid_vsco_url(url))

    def test_valid_profile_url(self) -> None:
        self.assertTrue(is_valid_vsco_url("https://vsco.co/alice"))

    def test_www_and_trailing_junk(self) -> None:
        self.assertTrue(is_valid_vsco_url("https://www.vsco.co/alice/media/abc),"))
        self.assertEqual(
            normalize_url("https://www.vsco.co/alice/media/abc),"),
            "https://www.vsco.co/alice/media/abc",
        )

    def test_rejects_non_vsco(self) -> None:
        self.assertFalse(is_valid_vsco_url("https://instagram.com/alice"))
        self.assertFalse(is_valid_vsco_url("https://vsco.co/"))
        self.assertFalse(is_valid_vsco_url("not a url"))

    def test_extract_unique_preserving_order(self) -> None:
        text = """
        check these:
        https://vsco.co/bob/media/111
        https://vsco.co/bob
        https://vsco.co/bob/media/111
        https://example.com/nope
        """
        urls = extract_vsco_urls(text)
        self.assertEqual(
            urls,
            [
                "https://vsco.co/bob/media/111",
                "https://vsco.co/bob",
            ],
        )

    def test_collection_and_space(self) -> None:
        self.assertTrue(is_valid_vsco_url("https://vsco.co/user/collection/xyz"))
        self.assertTrue(is_valid_vsco_url("https://vsco.co/user/space/xyz"))
        self.assertTrue(is_valid_vsco_url("https://vsco.co/user/gallery/xyz"))


class EngineCommandTests(unittest.TestCase):
    def test_command_includes_destination_and_urls(self) -> None:
        from vsco_downloader.engine import build_gallery_dl_command, find_gallery_dl

        if find_gallery_dl() is None:
            self.skipTest("gallery-dl not installed")

        import tempfile
        from pathlib import Path

        with tempfile.TemporaryDirectory() as tmp:
            cmd = build_gallery_dl_command(
                ["https://vsco.co/alice/media/abc"],
                tmp,
                jobs=2,
            )
            self.assertIn("-D", cmd)
            self.assertIn(str(Path(tmp).resolve()), cmd)
            self.assertIn("-j", cmd)
            self.assertIn("2", cmd)
            self.assertIn("https://vsco.co/alice/media/abc", cmd)


if __name__ == "__main__":
    unittest.main()
