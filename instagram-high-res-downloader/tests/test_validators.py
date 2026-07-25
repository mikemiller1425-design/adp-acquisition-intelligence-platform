"""Deep unit tests for Instagram URL validation and extraction."""

from __future__ import annotations

import unittest

from instagram_downloader.validators import (
    extract_instagram_urls,
    is_valid_instagram_url,
    normalize_url,
)


class NormalizeUrlTests(unittest.TestCase):
    def test_strips_whitespace_and_junk(self) -> None:
        self.assertEqual(
            normalize_url("  https://www.instagram.com/p/ABC/ ).,\"'"),
            "https://www.instagram.com/p/ABC/",
        )

    def test_empty(self) -> None:
        self.assertEqual(normalize_url(""), "")
        self.assertEqual(normalize_url(None), "")  # type: ignore[arg-type]


class IsValidInstagramUrlTests(unittest.TestCase):
    def test_post_reel_tv_reels(self) -> None:
        self.assertTrue(is_valid_instagram_url("https://www.instagram.com/p/AbCdEfGhIjK/"))
        self.assertTrue(is_valid_instagram_url("https://www.instagram.com/reel/AbCdEfGhIjK/"))
        self.assertTrue(is_valid_instagram_url("https://www.instagram.com/reels/AbCdEfGhIjK/"))
        self.assertTrue(is_valid_instagram_url("https://www.instagram.com/tv/AbCdEfGhIjK/"))

    def test_profile_and_stories(self) -> None:
        self.assertTrue(is_valid_instagram_url("https://instagram.com/natgeo"))
        self.assertTrue(is_valid_instagram_url("https://www.instagram.com/stories/natgeo/123"))
        self.assertTrue(is_valid_instagram_url("https://www.instagram.com/natgeo/tagged/"))

    def test_short_domain_and_mobile(self) -> None:
        self.assertTrue(is_valid_instagram_url("https://instagr.am/p/AbCdEfGhIjK/"))
        self.assertTrue(is_valid_instagram_url("https://m.instagram.com/p/AbCdEfGhIjK/"))

    def test_http_allowed(self) -> None:
        self.assertTrue(is_valid_instagram_url("http://www.instagram.com/natgeo"))

    def test_rejects_wrong_scheme_and_host(self) -> None:
        self.assertFalse(is_valid_instagram_url("ftp://www.instagram.com/natgeo"))
        self.assertFalse(is_valid_instagram_url("https://facebook.com/natgeo"))
        self.assertFalse(is_valid_instagram_url("https://instagram.evil.com/natgeo"))

    def test_rejects_bare_domain(self) -> None:
        self.assertFalse(is_valid_instagram_url("https://www.instagram.com/"))
        self.assertFalse(is_valid_instagram_url("https://www.instagram.com"))

    def test_rejects_blocked_paths(self) -> None:
        for path in (
            "about",
            "accounts",
            "ads",
            "developer",
            "directory",
            "emails",
            "legal",
            "lite",
            "login",
            "privacy",
            "session",
            "signup",
            "terms",
            "web",
        ):
            with self.subTest(path=path):
                self.assertFalse(is_valid_instagram_url(f"https://www.instagram.com/{path}"))

    def test_case_insensitive_host(self) -> None:
        self.assertTrue(is_valid_instagram_url("https://WWW.INSTAGRAM.COM/NatGeo"))

    def test_query_and_fragment_ok(self) -> None:
        self.assertTrue(
            is_valid_instagram_url("https://www.instagram.com/p/ABC/?igsh=xyz#fragment")
        )


class ExtractInstagramUrlsTests(unittest.TestCase):
    def test_empty(self) -> None:
        self.assertEqual(extract_instagram_urls(""), [])
        self.assertEqual(extract_instagram_urls(None), [])  # type: ignore[arg-type]

    def test_order_and_dedupe(self) -> None:
        text = (
            "https://www.instagram.com/p/AAA/\n"
            "https://www.instagram.com/natgeo\n"
            "https://www.instagram.com/p/AAA/\n"
        )
        self.assertEqual(
            extract_instagram_urls(text),
            [
                "https://www.instagram.com/p/AAA/",
                "https://www.instagram.com/natgeo",
            ],
        )

    def test_dedupe_www_mobile_short_domain(self) -> None:
        text = (
            "https://instagram.com/p/ABC/\n"
            "https://www.instagram.com/p/ABC/\n"
            "https://m.instagram.com/p/ABC/\n"
            "https://instagr.am/p/ABC/\n"
        )
        urls = extract_instagram_urls(text)
        self.assertEqual(len(urls), 1)

    def test_dedupe_trailing_slash(self) -> None:
        text = "https://www.instagram.com/natgeo/\nhttps://www.instagram.com/natgeo\n"
        self.assertEqual(len(extract_instagram_urls(text)), 1)

    def test_embedded_in_prose(self) -> None:
        text = "check https://www.instagram.com/p/XYZ/ please"
        self.assertEqual(
            extract_instagram_urls(text),
            ["https://www.instagram.com/p/XYZ/"],
        )

    def test_single_line_blob(self) -> None:
        text = "a https://www.instagram.com/p/A/ b https://www.instagram.com/p/B/ c"
        self.assertEqual(len(extract_instagram_urls(text)), 2)

    def test_ignores_non_instagram(self) -> None:
        text = "https://vsco.co/a\nhttps://facebook.com/a\n"
        self.assertEqual(extract_instagram_urls(text), [])

    def test_filters_blocked_keeps_valid(self) -> None:
        text = "https://www.instagram.com/login\nhttps://www.instagram.com/natgeo\n"
        self.assertEqual(extract_instagram_urls(text), ["https://www.instagram.com/natgeo"])

    def test_markdown_parens(self) -> None:
        text = "(https://www.instagram.com/p/ABC/)"
        self.assertEqual(extract_instagram_urls(text), ["https://www.instagram.com/p/ABC/"])


if __name__ == "__main__":
    unittest.main()
