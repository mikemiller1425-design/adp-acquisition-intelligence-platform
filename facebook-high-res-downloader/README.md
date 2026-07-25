# Facebook High-Res Downloader

A clean, modern, cross-platform desktop GUI for downloading **original / highest-resolution** Facebook photos and videos.

It wraps [`gallery-dl`](https://github.com/mikf/gallery-dl), which already ships Facebook extractors for photos, videos, albums/sets, posts, profiles, and groups.

![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- Paste one or more Facebook URLs (photos, videos, albums, posts, profiles, groups)
- Drag-and-drop destination folder (with Browse… fallback)
- Large **Download High-Res** button — only enabled when URLs + folder are ready
- Optional **browser cookies** (Chrome / Firefox / Edge / …) — strongly recommended
- Live progress log, cancel support, and a finish summary
- Dark / light / system theme toggle
- Remembers the last destination folder and cookie preference between sessions
- Sensible filenames: `{username}_{id}.{ext}`

---

## Requirements

| Dependency | Notes |
|---|---|
| **Python 3.10+** | 3.10, 3.11, or 3.12 recommended |
| **Tk** | Usually bundled with Python on Windows/macOS. On Linux install `python3-tk`. |
| **gallery-dl** | Installed via pip (see below). Needs network access to facebook.com. |
| **tkinterdnd2** | Optional but recommended for true folder drag-and-drop. |
| **Logged-in browser** | Facebook frequently requires cookies; stay logged into Facebook in Chrome/Firefox. |

### System packages (Linux)

```bash
# Debian / Ubuntu
sudo apt update
sudo apt install python3-tk python3-pip

# Fedora
sudo dnf install python3-tkinter python3-pip
```

---

## Installation

```bash
cd facebook-high-res-downloader

python3 -m venv .venv

# macOS / Linux
source .venv/bin/activate

# Windows (PowerShell)
# .venv\Scripts\Activate.ps1

pip install -r requirements.txt
```

Verify `gallery-dl` works:

```bash
gallery-dl --version
# or
python -m gallery_dl --version
```

---

## How to run

```bash
python run.py
```

Or as a module:

```bash
python -m facebook_downloader
```

### Typical workflow

1. Paste one or more Facebook links into the URL box (or use **Paste from clipboard**).
2. Drop a folder onto the destination zone, or click **Browse…**.
3. (Recommended) Choose your browser under **Browser cookies** — you must already be logged into Facebook there.
4. Click **Download High-Res**.
5. Watch the live log. Use **Cancel** to stop early.
6. When finished, open the destination folder from the prompt or the **Open folder** button.

---

## Supported URL shapes

```
https://www.facebook.com/photo/?fbid=<id>
https://www.facebook.com/<user>/photos/...
https://www.facebook.com/watch/?v=<id>
https://www.facebook.com/<user>/videos/<id>
https://www.facebook.com/media/set/?set=...
https://www.facebook.com/<user>/posts/...
https://www.facebook.com/groups/<id>/permalink/...
https://www.facebook.com/<username>
https://fb.watch/<code>
https://m.facebook.com/...
```

Invalid or non-Facebook lines are ignored. The counter shows how many valid URLs were detected.

---

## How downloads work

The app launches `gallery-dl` as a subprocess with:

| Flag / option | Purpose |
|---|---|
| `-D <folder>` | Save files **exactly** into your chosen destination (no `facebook/` subfolder) |
| `-o filename={username\|facebook}_{id}.{extension}` | Readable filenames |
| `-o videos=true` | Include videos at best available quality |
| `-o skip=name` | Skip files that already exist |
| `--cookies-from-browser <name>` | Optional login cookies from your browser |
| `-j 2` | Modest concurrency (keeps rate-limit risk lower) |
| `-v` | Verbose log lines streamed into the UI |

---

## Cookies & Facebook quirks

Facebook often blocks anonymous requests. If you see login errors, `401`, or empty results:

1. Log into Facebook in Chrome or Firefox.
2. In the app, set **Browser cookies** to that browser.
3. Retry the download.

---

## Settings

- Linux: `~/.config/facebook-high-res-downloader/settings.json`
- Other: `~/.facebook-high-res-downloader/settings.json`

Remembers destination folder, appearance mode, cookie browser preference, and window size.

---

## Packaging (optional)

```bash
pip install pyinstaller
pyinstaller --noconfirm --windowed \
  --name "Facebook High-Res Downloader" \
  --collect-all customtkinter \
  --collect-all tkinterdnd2 \
  --collect-all gallery_dl \
  run.py
```

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Unable to start GUI` / no display | Run on a desktop session, or enable X11/Wayland forwarding |
| `gallery-dl was not found` | `pip install gallery-dl` inside the same venv |
| Login / 401 / empty downloads | Select browser cookies; stay logged into Facebook |
| Drag & drop does nothing | Install `tkinterdnd2`, or use **Browse…** |
| Rate limits | Wait and retry; use cookies |
| Permission denied on folder | Pick a writable destination |
| Private / friends-only content | You must be able to view it while logged in (cookies) |

---

## Project layout

```
facebook-high-res-downloader/
├── README.md
├── requirements.txt
├── pyproject.toml
├── run.py
└── facebook_downloader/
    ├── __init__.py
    ├── __main__.py
    ├── app.py          # CustomTkinter UI
    ├── config.py       # Persistent settings
    ├── engine.py       # gallery-dl subprocess runner
    └── validators.py   # Facebook URL parsing
```

This app lives alongside `vsco-high-res-downloader/` and `instagram-high-res-downloader/` in the same repository.

---

## License

MIT — free to use and modify. Facebook is a trademark of Meta Platforms, Inc.; this tool is unofficial and for personal archival of content you have rights to access.
