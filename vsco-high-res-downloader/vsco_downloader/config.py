"""Persistent application settings (last destination folder, theme, etc.)."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def _default_config_path() -> Path:
    """Return the platform-appropriate config file location."""
    home = Path.home()
    # Prefer XDG on Linux; fall back to a dotfile in the home directory.
    xdg = home / ".config" / "vsco-high-res-downloader"
    if xdg.parent.exists() or Path("/etc/xdg").exists():
        xdg.mkdir(parents=True, exist_ok=True)
        return xdg / "settings.json"
    # macOS / Windows / generic fallback
    folder = home / ".vsco-high-res-downloader"
    folder.mkdir(parents=True, exist_ok=True)
    return folder / "settings.json"


class AppConfig:
    """Simple JSON-backed settings store."""

    DEFAULTS: dict[str, Any] = {
        "destination": "",
        "appearance_mode": "system",  # "light" | "dark" | "system"
        "window_geometry": "920x720",
    }

    def __init__(self, path: Path | None = None) -> None:
        self.path = path or _default_config_path()
        self._data: dict[str, Any] = dict(self.DEFAULTS)
        self.load()

    def load(self) -> None:
        """Load settings from disk; keep defaults on missing/corrupt files."""
        if not self.path.exists():
            return
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                for key, value in self.DEFAULTS.items():
                    if key in raw:
                        self._data[key] = raw[key]
        except (OSError, json.JSONDecodeError, TypeError):
            # Corrupt or unreadable — keep defaults.
            self._data = dict(self.DEFAULTS)

    def save(self) -> None:
        """Persist current settings to disk."""
        try:
            self.path.parent.mkdir(parents=True, exist_ok=True)
            self.path.write_text(
                json.dumps(self._data, indent=2, sort_keys=True) + "\n",
                encoding="utf-8",
            )
        except OSError:
            # Non-fatal: UI still works without persistence.
            pass

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default if default is not None else self.DEFAULTS.get(key))

    def set(self, key: str, value: Any) -> None:
        self._data[key] = value

    @property
    def destination(self) -> str:
        return str(self._data.get("destination") or "")

    @destination.setter
    def destination(self, value: str) -> None:
        self._data["destination"] = value

    @property
    def appearance_mode(self) -> str:
        mode = str(self._data.get("appearance_mode") or "system").lower()
        return mode if mode in {"light", "dark", "system"} else "system"

    @appearance_mode.setter
    def appearance_mode(self, value: str) -> None:
        mode = (value or "system").lower()
        self._data["appearance_mode"] = mode if mode in {"light", "dark", "system"} else "system"
