# VSCO High-Res Downloader

A clean, modern, cross-platform desktop GUI for downloading **original / highest-resolution** VSCO images and videos.

It wraps [`gallery-dl`](https://github.com/mikf/gallery-dl), which already ships excellent VSCO extractors for media pages, profiles, galleries, collections, and spaces.

![Python 3.10+](https://img.shields.io/badge/python-3.10%2B-blue)
![License](https://img.shields.io/badge/license-MIT-green)

---

## Features

- Paste one or more VSCO URLs (media, profile, gallery, collection, space)
- Drag-and-drop destination folder (with Browse… fallback)
- Large **Download High-Res** button — only enabled when URLs + folder are ready
- Live progress log, cancel support, and a finish summary
- Dark / light / system theme toggle
- Remembers the last destination folder between sessions
- Sensible filenames: `{username}_{id}.{ext}`

---

## Requirements

| Dependency | Notes |
|---|---|
| **Python 3.10+** | 3.10, 3.11, or 3.12 recommended |
| **Tk** | Usually bundled with Python on Windows/macOS. On Linux install `python3-tk`. |
| **gallery-dl** | Installed via pip (see below). Needs network access to vsco.co. |
| **tkinterdnd2** | Optional but recommended for true folder drag-and-drop. |

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
cd vsco-high-res-downloader

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
python -m vsco_downloader
```

### Typical workflow

1. Paste one or more VSCO links into the URL box (or use **Paste from clipboard**).
2. Drop a folder onto the destination zone, or click **Browse…**.
3. Click **Download High-Res**.
4. Watch the live log. Use **Cancel** to stop early.
5. When finished, open the destination folder from the prompt or the **Open folder** button.

---

## Supported URL shapes

```
https://vsco.co/username/media/<id>
https://vsco.co/username
https://vsco.co/username/gallery/...
https://vsco.co/username/collection/...
https://vsco.co/username/space/...
```

Invalid or non-VSCO lines are ignored. The counter shows how many valid URLs were detected.

---

## How downloads work

The app launches `gallery-dl` as a subprocess with:

| Flag / option | Purpose |
|---|---|
| `-D <folder>` | Save files **exactly** into your chosen destination (no `vsco/` subfolder) |
| `-o filename={username\|vsco}_{id}.{extension}` | Readable filenames |
| `-o skip=name` | Skip files that already exist |
| `-j 4` | Modest concurrency |
| `-v` | Verbose log lines streamed into the UI |

Highest quality is the default for VSCO in gallery-dl (original images / best available video).

---

## Settings

A small JSON config is stored at:

- Linux: `~/.config/vsco-high-res-downloader/settings.json`
- Other: `~/.vsco-high-res-downloader/settings.json`

It remembers the last destination folder, appearance mode, and window size.

---

## Packaging (optional)

### PyInstaller (single binary)

```bash
pip install pyinstaller
pyinstaller --noconfirm --windowed --name "VSCO High-Res Downloader" run.py
```

You may need to add data/hooks for `customtkinter` and `tkinterdnd2`, for example:

```bash
pyinstaller --noconfirm --windowed \
  --name "VSCO High-Res Downloader" \
  --collect-all customtkinter \
  --collect-all tkinterdnd2 \
  --collect-all gallery_dl \
  run.py
```

### Briefcase

Briefcase can produce native `.app` / `.msi` / `.AppImage` installers. Point it at `vsco_downloader.app:main` as the entry point once you add a Briefcase `pyproject.toml` section.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| `Unable to start GUI` / no display | Run on a desktop session, or enable X11/Wayland forwarding |
| `gallery-dl was not found` | `pip install gallery-dl` inside the same venv |
| Drag & drop does nothing | Install `tkinterdnd2`, or use **Browse…** |
| Empty downloads / private content | That profile or media may require login; gallery-dl cookies can be configured separately |
| Rate limits / network errors | Wait and retry; check the live log for HTTP status lines |
| Permission denied on folder | Pick a writable destination |

---

## Project layout

```
vsco-high-res-downloader/
├── README.md
├── requirements.txt
├── pyproject.toml
├── run.py
└── vsco_downloader/
    ├── __init__.py
    ├── __main__.py
    ├── app.py          # CustomTkinter UI
    ├── config.py       # Persistent settings
    ├── engine.py       # gallery-dl subprocess runner
    └── validators.py   # VSCO URL parsing
```

---

## License

MIT — free to use and modify. VSCO is a trademark of its respective owners; this tool is unofficial and for personal archival of content you have rights to access.
