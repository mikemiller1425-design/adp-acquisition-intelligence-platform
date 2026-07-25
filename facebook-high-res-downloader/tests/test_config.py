"""Deep unit tests for Facebook AppConfig persistence."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from facebook_downloader.config import AppConfig, _default_config_path


class AppConfigTests(unittest.TestCase):
    def test_defaults_on_missing_file(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "missing.json"
            cfg = AppConfig(path=path)
            self.assertEqual(cfg.destination, "")
            self.assertEqual(cfg.appearance_mode, "system")
            self.assertEqual(cfg.cookies_from_browser, "")
            self.assertEqual(cfg.get("window_geometry"), "920x740")

    def test_roundtrip_save_load(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            cfg = AppConfig(path=path)
            cfg.destination = "/downloads/fb"
            cfg.appearance_mode = "dark"
            cfg.cookies_from_browser = "Firefox"
            cfg.set("window_geometry", "1000x800")
            cfg.save()

            loaded = AppConfig(path=path)
            self.assertEqual(loaded.destination, "/downloads/fb")
            self.assertEqual(loaded.appearance_mode, "dark")
            self.assertEqual(loaded.cookies_from_browser, "firefox")
            self.assertEqual(loaded.get("window_geometry"), "1000x800")

            raw = json.loads(path.read_text(encoding="utf-8"))
            self.assertEqual(raw["cookies_from_browser"], "firefox")

    def test_corrupt_json_falls_back_to_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            path.write_text("{not-json", encoding="utf-8")
            cfg = AppConfig(path=path)
            self.assertEqual(cfg.destination, "")
            self.assertEqual(cfg.appearance_mode, "system")

    def test_non_dict_json_falls_back(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            path.write_text("[1, 2, 3]", encoding="utf-8")
            cfg = AppConfig(path=path)
            self.assertEqual(cfg.appearance_mode, "system")

    def test_unknown_keys_in_file_are_ignored(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            path.write_text(
                json.dumps({"destination": "/ok", "hack": True, "appearance_mode": "light"}),
                encoding="utf-8",
            )
            cfg = AppConfig(path=path)
            self.assertEqual(cfg.destination, "/ok")
            self.assertEqual(cfg.appearance_mode, "light")
            self.assertIsNone(cfg.get("hack", None))

    def test_appearance_mode_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cfg = AppConfig(path=Path(tmp) / "s.json")
            for mode in ("light", "dark", "system", "LIGHT", "Dark"):
                with self.subTest(mode=mode):
                    cfg.appearance_mode = mode
                    self.assertIn(cfg.appearance_mode, {"light", "dark", "system"})
            cfg.appearance_mode = "neon"
            self.assertEqual(cfg.appearance_mode, "system")
            cfg.appearance_mode = ""
            self.assertEqual(cfg.appearance_mode, "system")

    def test_cookies_normalized_lower_stripped(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cfg = AppConfig(path=Path(tmp) / "s.json")
            cfg.cookies_from_browser = "  Chrome  "
            self.assertEqual(cfg.cookies_from_browser, "chrome")
            cfg.cookies_from_browser = ""
            self.assertEqual(cfg.cookies_from_browser, "")

    def test_get_set_custom_key(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cfg = AppConfig(path=Path(tmp) / "s.json")
            cfg.set("window_geometry", "1x1")
            self.assertEqual(cfg.get("window_geometry"), "1x1")
            self.assertEqual(cfg.get("missing_key", "fallback"), "fallback")

    def test_save_creates_parent_directories(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "nested" / "dir" / "settings.json"
            cfg = AppConfig(path=path)
            cfg.destination = "/x"
            cfg.save()
            self.assertTrue(path.exists())

    def test_default_config_path_is_path(self) -> None:
        path = _default_config_path()
        self.assertIsInstance(path, Path)
        self.assertEqual(path.name, "settings.json")
        self.assertIn("facebook-high-res-downloader", str(path))


if __name__ == "__main__":
    unittest.main()
