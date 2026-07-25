"""Deep unit tests for Facebook URL validation and extraction."""

from __future__ import annotations

import unittest

from facebook_downloader.validators import (
    extract_facebook_urls,
    is_valid_facebook_url,
    normalize_url,
)


class NormalizeUrlTests(unittest.TestCase):
    def test_strips_whitespace(self) -> None:
        self.assertEqual(
            normalize_url("  https://www.facebook.com/natgeo  \n"),
            "https://www.facebook.com/natgeo",
        )

    def test_strips_trailing_punctuation_stack(self) -> None:
        self.assertEqual(
            normalize_url("https://www.facebook.com/natgeo).,\"'"),
            "https://www.facebook.com/natgeo",
        )

    def test_empty_and_none_like(self) -> None:
        self.assertEqual(normalize_url(""), "")
        self.assertEqual(normalize_url("   "), "")
        self.assertEqual(normalize_url(None), "")  # type: ignore[arg-type]

    def test_preserves_query_string(self) -> None:
        url = "https://www.facebook.com/photo/?fbid=123&set=a.456"
        self.assertEqual(normalize_url(url), url)

    def test_does_not_strip_internal_punctuation(self) -> None:
        url = "https://www.facebook.com/path.with.dots/ok"
        self.assertEqual(normalize_url(url + ","), url)


class IsValidFacebookUrlTests(unittest.TestCase):
    def test_photo_fbid_query(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/photo/?fbid=1234567890"))

    def test_photo_php_style(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/photo.php?fbid=99"))

    def test_watch_video(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/watch/?v=987654321"))

    def test_user_videos_path(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/natgeo/videos/111222"))

    def test_media_set(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/media/set/?set=a.123.456"))

    def test_posts_and_permalink(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/natgeo/posts/pfbid0abc"))
        self.assertTrue(
            is_valid_facebook_url("https://www.facebook.com/groups/123/permalink/456/")
        )

    def test_profile_username(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/natgeo"))
        self.assertTrue(is_valid_facebook_url("http://facebook.com/natgeo"))

    def test_fb_watch_short_link(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://fb.watch/AbCdEfGh/"))
        self.assertFalse(is_valid_facebook_url("https://fb.watch/"))
        self.assertFalse(is_valid_facebook_url("https://fb.watch"))

    def test_mobile_and_web_subdomains(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://m.facebook.com/natgeo"))
        self.assertTrue(is_valid_facebook_url("https://web.facebook.com/natgeo"))
        self.assertTrue(is_valid_facebook_url("https://m.fb.com/natgeo"))

    def test_story_fbid_query_without_path(self) -> None:
        self.assertTrue(
            is_valid_facebook_url("https://www.facebook.com/story.php?story_fbid=1&id=2")
        )

    def test_rejects_wrong_scheme(self) -> None:
        self.assertFalse(is_valid_facebook_url("ftp://www.facebook.com/natgeo"))
        self.assertFalse(is_valid_facebook_url("www.facebook.com/natgeo"))

    def test_rejects_wrong_host(self) -> None:
        self.assertFalse(is_valid_facebook_url("https://instagram.com/natgeo"))
        self.assertFalse(is_valid_facebook_url("https://facebook.evil.com/natgeo"))
        self.assertFalse(is_valid_facebook_url("https://notfacebook.com/natgeo"))

    def test_rejects_bare_domain(self) -> None:
        self.assertFalse(is_valid_facebook_url("https://www.facebook.com/"))
        self.assertFalse(is_valid_facebook_url("https://www.facebook.com"))

    def test_rejects_blocked_chrome_paths(self) -> None:
        for path in (
            "login",
            "recover",
            "checkpoint",
            "privacy",
            "policies",
            "help",
            "settings",
            "dialog",
            "sharer",
            "share",
            "r.php",
        ):
            with self.subTest(path=path):
                self.assertFalse(is_valid_facebook_url(f"https://www.facebook.com/{path}"))

    def test_accepts_blocked_name_as_deeper_path_segment(self) -> None:
        # Only the first segment is blocked — deeper paths are fine.
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/natgeo/help"))

    def test_trailing_junk_still_valid(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://www.facebook.com/photo/?fbid=123)."))

    def test_case_insensitive_host(self) -> None:
        self.assertTrue(is_valid_facebook_url("https://WWW.FACEBOOK.COM/NatGeo"))


class ExtractFacebookUrlsTests(unittest.TestCase):
    def test_empty_inputs(self) -> None:
        self.assertEqual(extract_facebook_urls(""), [])
        self.assertEqual(extract_facebook_urls("   \n\n  "), [])
        self.assertEqual(extract_facebook_urls(None), [])  # type: ignore[arg-type]

    def test_preserves_first_seen_order(self) -> None:
        text = (
            "https://www.facebook.com/b\n"
            "https://www.facebook.com/a\n"
            "https://www.facebook.com/c\n"
        )
        self.assertEqual(
            extract_facebook_urls(text),
            [
                "https://www.facebook.com/b",
                "https://www.facebook.com/a",
                "https://www.facebook.com/c",
            ],
        )

    def test_dedupes_exact_duplicates(self) -> None:
        text = "https://www.facebook.com/a\nhttps://www.facebook.com/a\n"
        self.assertEqual(extract_facebook_urls(text), ["https://www.facebook.com/a"])

    def test_dedupes_www_mobile_and_fb_com(self) -> None:
        text = (
            "https://facebook.com/natgeo\n"
            "https://www.facebook.com/natgeo\n"
            "https://m.facebook.com/natgeo\n"
            "https://web.facebook.com/natgeo\n"
            "https://fb.com/natgeo\n"
        )
        urls = extract_facebook_urls(text)
        self.assertEqual(len(urls), 1)
        self.assertEqual(urls[0], "https://facebook.com/natgeo")

    def test_dedupes_trailing_slash_variants(self) -> None:
        text = "https://www.facebook.com/natgeo/\nhttps://www.facebook.com/natgeo\n"
        self.assertEqual(len(extract_facebook_urls(text)), 1)

    def test_keeps_distinct_query_ids(self) -> None:
        text = (
            "https://www.facebook.com/photo/?fbid=1\n"
            "https://www.facebook.com/photo/?fbid=2\n"
        )
        self.assertEqual(len(extract_facebook_urls(text)), 2)

    def test_embedded_urls_in_prose(self) -> None:
        text = "see https://www.facebook.com/photo/?fbid=42 and also https://fb.watch/xyz/ thanks"
        urls = extract_facebook_urls(text)
        self.assertEqual(len(urls), 2)
        self.assertTrue(urls[0].startswith("https://www.facebook.com/photo/"))
        self.assertTrue(urls[1].startswith("https://fb.watch/"))

    def test_single_line_blob_without_newlines(self) -> None:
        text = "x https://www.facebook.com/a y https://www.facebook.com/b z"
        urls = extract_facebook_urls(text)
        self.assertEqual(len(urls), 2)

    def test_ignores_non_facebook_lines(self) -> None:
        text = "https://instagram.com/x\nhttps://example.com\nnot a url\n"
        self.assertEqual(extract_facebook_urls(text), [])

    def test_mixed_valid_and_invalid(self) -> None:
        text = (
            "https://www.facebook.com/login\n"
            "https://www.facebook.com/natgeo\n"
            "https://vsco.co/alice\n"
        )
        self.assertEqual(extract_facebook_urls(text), ["https://www.facebook.com/natgeo"])

    def test_markdown_wrapped_url(self) -> None:
        text = "link: (https://www.facebook.com/natgeo)"
        urls = extract_facebook_urls(text)
        self.assertEqual(urls, ["https://www.facebook.com/natgeo"])


if __name__ == "__main__":
    unittest.main()
