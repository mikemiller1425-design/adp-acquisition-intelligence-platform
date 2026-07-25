"""Deep unit tests for Instagram AppConfig persistence."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from instagram_downloader.config import AppConfig, _default_config_path


class AppConfigTests(unittest.TestCase):
    def test_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cfg = AppConfig(path=Path(tmp) / "missing.json")
            self.assertEqual(cfg.destination, "")
            self.assertEqual(cfg.appearance_mode, "system")
            self.assertEqual(cfg.cookies_from_browser, "")
            self.assertEqual(cfg.get("window_geometry"), "920x720")

    def test_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            cfg = AppConfig(path=path)
            cfg.destination = "/ig"
            cfg.appearance_mode = "light"
            cfg.cookies_from_browser = " Edge "
            cfg.save()
            loaded = AppConfig(path=path)
            self.assertEqual(loaded.destination, "/ig")
            self.assertEqual(loaded.appearance_mode, "light")
            self.assertEqual(loaded.cookies_from_browser, "edge")

    def test_corrupt_and_non_dict(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / "bad.json"
            bad.write_text("{bad", encoding="utf-8")
            self.assertEqual(AppConfig(path=bad).appearance_mode, "system")
            arr = Path(tmp) / "arr.json"
            arr.write_text("[]", encoding="utf-8")
            self.assertEqual(AppConfig(path=arr).destination, "")

    def test_appearance_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cfg = AppConfig(path=Path(tmp) / "s.json")
            cfg.appearance_mode = "DARK"
            self.assertEqual(cfg.appearance_mode, "dark")
            cfg.appearance_mode = "nope"
            self.assertEqual(cfg.appearance_mode, "system")

    def test_ignores_unknown_keys(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "s.json"
            path.write_text(json.dumps({"destination": "/x", "extra": 1}), encoding="utf-8")
            cfg = AppConfig(path=path)
            self.assertEqual(cfg.destination, "/x")
            self.assertIsNone(cfg.get("extra", None))

    def test_default_path(self) -> None:
        path = _default_config_path()
        self.assertEqual(path.name, "settings.json")
        self.assertIn("instagram-high-res-downloader", str(path))


if __name__ == "__main__":
    unittest.main()
