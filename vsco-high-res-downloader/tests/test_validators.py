"""Deep unit tests for VSCO URL validation and extraction."""

from __future__ import annotations

import unittest

from vsco_downloader.validators import (
    extract_vsco_urls,
    is_valid_vsco_url,
    normalize_url,
)


class NormalizeUrlTests(unittest.TestCase):
    def test_strips_whitespace_and_junk(self) -> None:
        self.assertEqual(
            normalize_url("  https://vsco.co/alice/media/abc ).,\"'"),
            "https://vsco.co/alice/media/abc",
        )

    def test_empty(self) -> None:
        self.assertEqual(normalize_url(""), "")
        self.assertEqual(normalize_url(None), "")  # type: ignore[arg-type]


class IsValidVscoUrlTests(unittest.TestCase):
    def test_media_profile_gallery_collection_space(self) -> None:
        self.assertTrue(is_valid_vsco_url("https://vsco.co/alice/media/1234567890abcdef"))
        self.assertTrue(is_valid_vsco_url("https://vsco.co/alice"))
        self.assertTrue(is_valid_vsco_url("https://vsco.co/alice/gallery/xyz"))
        self.assertTrue(is_valid_vsco_url("https://vsco.co/alice/collection/xyz"))
        self.assertTrue(is_valid_vsco_url("https://vsco.co/alice/space/xyz"))

    def test_www_and_http(self) -> None:
        self.assertTrue(is_valid_vsco_url("https://www.vsco.co/alice/media/abc"))
        self.assertTrue(is_valid_vsco_url("http://vsco.co/alice"))

    def test_rejects_wrong_scheme_and_host(self) -> None:
        self.assertFalse(is_valid_vsco_url("ftp://vsco.co/alice"))
        self.assertFalse(is_valid_vsco_url("https://instagram.com/alice"))
        self.assertFalse(is_valid_vsco_url("https://vsco.com/alice"))
        self.assertFalse(is_valid_vsco_url("https://evilvsco.co/alice"))

    def test_rejects_bare_domain(self) -> None:
        self.assertFalse(is_valid_vsco_url("https://vsco.co/"))
        self.assertFalse(is_valid_vsco_url("https://vsco.co"))

    def test_rejects_blocked_first_segments(self) -> None:
        for path in ("about", "login", "signup"):
            with self.subTest(path=path):
                self.assertFalse(is_valid_vsco_url(f"https://vsco.co/{path}"))

    def test_case_insensitive_host(self) -> None:
        self.assertTrue(is_valid_vsco_url("https://WWW.VSCO.CO/Alice"))

    def test_trailing_junk(self) -> None:
        self.assertTrue(is_valid_vsco_url("https://www.vsco.co/alice/media/abc),"))


class ExtractVscoUrlsTests(unittest.TestCase):
    def test_empty(self) -> None:
        self.assertEqual(extract_vsco_urls(""), [])
        self.assertEqual(extract_vsco_urls(None), [])  # type: ignore[arg-type]

    def test_order_and_dedupe(self) -> None:
        text = """
        https://vsco.co/bob/media/111
        https://vsco.co/bob
        https://vsco.co/bob/media/111
        https://example.com/nope
        """
        self.assertEqual(
            extract_vsco_urls(text),
            [
                "https://vsco.co/bob/media/111",
                "https://vsco.co/bob",
            ],
        )

    def test_dedupe_www_and_trailing_slash(self) -> None:
        text = "https://vsco.co/alice\nhttps://www.vsco.co/alice/\n"
        self.assertEqual(len(extract_vsco_urls(text)), 1)

    def test_keeps_query_distinction(self) -> None:
        text = "https://vsco.co/a?x=1\nhttps://vsco.co/a?x=2\n"
        # Both valid if path has username — query preserved in key
        self.assertEqual(len(extract_vsco_urls(text)), 2)

    def test_embedded_and_blob(self) -> None:
        self.assertEqual(
            extract_vsco_urls("see https://vsco.co/alice/media/xyz please"),
            ["https://vsco.co/alice/media/xyz"],
        )
        blob = "x https://vsco.co/a y https://vsco.co/b z"
        self.assertEqual(len(extract_vsco_urls(blob)), 2)

    def test_filters_blocked(self) -> None:
        text = "https://vsco.co/login\nhttps://vsco.co/alice\n"
        self.assertEqual(extract_vsco_urls(text), ["https://vsco.co/alice"])

    def test_markdown_parens(self) -> None:
        self.assertEqual(
            extract_vsco_urls("(https://vsco.co/alice)"),
            ["https://vsco.co/alice"],
        )


if __name__ == "__main__":
    unittest.main()
