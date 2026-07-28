# Instagram High-Res Downloader

A clean, modern, cross-platform desktop GUI for downloading **original / highest-resolution** Instagram photos and videos.

It wraps [`gallery-dl`](https://github.com/mikf/gallery-dl), which already ships excellent Instagram extractors for posts, reels, IGTV, profiles, and stories.

![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- Paste one or more Instagram URLs (posts, reels, IGTV, profiles, stories)
- Drag-and-drop destination folder (with Browse… fallback)
- Large **Download High-Res** button — only enabled when URLs + folder are ready
- Optional **browser cookies** (Chrome / Firefox / Edge / …) — strongly recommended
- Live progress log, cancel support, and a finish summary
- Dark / light / system theme toggle
- Remembers the last destination folder and cookie preference between sessions
- Sensible filenames: `{username}_{shortcode}.{ext}`

---

## Requirements

| Dependency | Notes |
|---|---|
| **Python 3.10+** | 3.10, 3.11, or 3.12 recommended |
| **Tk** | Usually bundled with Python on Windows/macOS. On Linux install `python3-tk`. |
| **gallery-dl** | Installed via pip (see below). Needs network access to instagram.com. |
| **tkinterdnd2** | Optional but recommended for true folder drag-and-drop. |
| **Logged-in browser** | Instagram frequently requires cookies; stay logged into IG in Chrome/Firefox. |

### System packages (Linux)

```bash
# Debian / Ubuntu
sudo apt update
sudo apt install python3-tk python3-pip

# Fedora
sudo dnf install python3-tkinter python3-pip
```

On macOS, use the official Python installer from [python.org](https://www.python.org/downloads/) (Homebrew’s Python sometimes needs an extra Tk install).

---

## Installation

```bash
cd instagram-high-res-downloader

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

From the project directory (with the venv activated):

```bash
python run.py
```

Or as a module:

```bash
python -m instagram_downloader
```

### Typical workflow

1. Paste one or more Instagram links into the URL box (or use **Paste from clipboard**).
2. Drop a folder onto the destination zone, or click **Browse…**.
3. (Recommended) Choose your browser under **Browser cookies** — you must already be logged into Instagram there.
4. Click **Download High-Res**.
5. Watch the live log. Use **Cancel** to stop early.
6. When finished, open the destination folder from the prompt or the **Open folder** button.

---

## Supported URL shapes

```
https://www.instagram.com/p/<shortcode>/
https://www.instagram.com/reel/<shortcode>/
https://www.instagram.com/reels/<shortcode>/
https://www.instagram.com/tv/<shortcode>/
https://www.instagram.com/<username>/
https://www.instagram.com/stories/<username>/…
https://instagr.am/p/<shortcode>/
```

Invalid or non-Instagram lines are ignored. The counter shows how many valid URLs were detected.

---

## How downloads work

The app launches `gallery-dl` as a subprocess with:

| Flag / option | Purpose |
|---|---|
| `-D <folder>` | Save files **exactly** into your chosen destination (no `instagram/` subfolder) |
| `-o filename={username\|instagram}_{shortcode\|media_id}.{extension}` | Readable filenames |
| `-o videos=true` | Include videos at best available quality |
| `-o skip=name` | Skip files that already exist |
| `--cookies-from-browser <name>` | Optional login cookies from your browser |
| `-j 2` | Modest concurrency (keeps rate-limit risk lower) |
| `-v` | Verbose log lines streamed into the UI |

gallery-dl requests the largest available Instagram assets by default.

---

## Cookies & Instagram quirks

Instagram aggressively rate-limits and often blocks anonymous requests. If you see login errors, `401`, or empty results:

1. Log into Instagram in Chrome or Firefox.
2. In the app, set **Browser cookies** to that browser.
3. Retry the download.

You can also pass a Netscape cookies file manually via gallery-dl’s `--cookies` flag if you prefer not to use `--cookies-from-browser` (advanced; not exposed in the GUI yet).

---

## Settings

A small JSON config is stored at:

- Linux: `~/.config/instagram-high-res-downloader/settings.json`
- Other: `~/.instagram-high-res-downloader/settings.json`

It remembers the last destination folder, appearance mode, cookie browser preference, and window size.

---

## Packaging (optional)

### PyInstaller (single binary)

```bash
pip install pyinstaller
pyinstaller --noconfirm --windowed \
  --name "Instagram High-Res Downloader" \
  --collect-all customtkinter \
  --collect-all tkinterdnd2 \
  --collect-all gallery_dl \
  run.py
```

### Briefcase

Briefcase can produce native `.app` / `.msi` / `.AppImage` installers. Point it at `instagram_downloader.app:main` as the entry point once you add a Briefcase `pyproject.toml` section.

---

## Standalone GitHub repository

This folder is self-contained. To publish it as its **own** GitHub repo:

```bash
cd instagram-high-res-downloader
git init
git add .
git commit -m "Initial commit: Instagram High-Res Downloader"
gh repo create instagram-high-res-downloader --public --source=. --remote=origin --push
```

(Requires the GitHub CLI with write access on your account.)

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Unable to start GUI` / no display | Run on a desktop session, or enable X11/Wayland forwarding |
| `gallery-dl was not found` | `pip install gallery-dl` inside the same venv |
| Login / 401 / empty downloads | Select browser cookies; stay logged into Instagram |
| Drag & drop does nothing | Install `tkinterdnd2`, or use **Browse…** |
| Rate limits | Wait and retry; lower concurrency; use cookies |
| Permission denied on folder | Pick a writable destination |
| Private account content | You must follow that account while logged in (cookies) |

---

## Project layout

```
instagram-high-res-downloader/
├── README.md
├── requirements.txt
├── pyproject.toml
├── run.py
└── instagram_downloader/
    ├── __init__.py
    ├── __main__.py
    ├── app.py          # CustomTkinter UI
    ├── config.py       # Persistent settings
    ├── engine.py       # gallery-dl subprocess runner
    └── validators.py   # Instagram URL parsing
```

---

## License

MIT — free to use and modify. Instagram is a trademark of Meta Platforms, Inc.; this tool is unofficial and for personal archival of content you have rights to access.
