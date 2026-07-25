"""Deep unit tests for VSCO AppConfig persistence."""

from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from vsco_downloader.config import AppConfig, _default_config_path


class AppConfigTests(unittest.TestCase):
    def test_defaults(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cfg = AppConfig(path=Path(tmp) / "missing.json")
            self.assertEqual(cfg.destination, "")
            self.assertEqual(cfg.appearance_mode, "system")
            self.assertEqual(cfg.get("window_geometry"), "920x720")
            # VSCO config has no cookies field
            self.assertIsNone(cfg.get("cookies_from_browser", None))

    def test_roundtrip(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "settings.json"
            cfg = AppConfig(path=path)
            cfg.destination = "/vsco"
            cfg.appearance_mode = "dark"
            cfg.set("window_geometry", "800x600")
            cfg.save()
            loaded = AppConfig(path=path)
            self.assertEqual(loaded.destination, "/vsco")
            self.assertEqual(loaded.appearance_mode, "dark")
            self.assertEqual(loaded.get("window_geometry"), "800x600")

    def test_corrupt_json(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "bad.json"
            path.write_text("{bad", encoding="utf-8")
            self.assertEqual(AppConfig(path=path).appearance_mode, "system")

    def test_appearance_validation(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            cfg = AppConfig(path=Path(tmp) / "s.json")
            cfg.appearance_mode = "Light"
            self.assertEqual(cfg.appearance_mode, "light")
            cfg.appearance_mode = "weird"
            self.assertEqual(cfg.appearance_mode, "system")

    def test_ignores_unknown_keys(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "s.json"
            path.write_text(
                json.dumps({"destination": "/x", "cookies_from_browser": "chrome"}),
                encoding="utf-8",
            )
            cfg = AppConfig(path=path)
            self.assertEqual(cfg.destination, "/x")
            # Unknown keys are not loaded into get() via DEFAULTS filter
            self.assertIsNone(cfg.get("cookies_from_browser", None))

    def test_default_path(self) -> None:
        path = _default_config_path()
        self.assertEqual(path.name, "settings.json")
        self.assertIn("vsco-high-res-downloader", str(path))


if __name__ == "__main__":
    unittest.main()
