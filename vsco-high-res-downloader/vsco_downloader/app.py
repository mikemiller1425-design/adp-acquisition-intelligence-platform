"""Main CustomTkinter window for VSCO High-Res Downloader."""

from __future__ import annotations

import platform
import subprocess
import sys
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox
from typing import Any

import customtkinter as ctk

from vsco_downloader import __app_name__, __version__
from vsco_downloader.config import AppConfig
from vsco_downloader.engine import (
    DownloadEngine,
    DownloadResult,
    DownloadState,
    gallery_dl_available,
)
from vsco_downloader.validators import extract_vsco_urls

# Optional drag-and-drop (tkinterdnd2). App still works via Browse… without it.
try:
    from tkinterdnd2 import DND_FILES, TkinterDnD

    _HAS_DND = True
except ImportError:  # pragma: no cover - optional dependency
    DND_FILES = None  # type: ignore[assignment]
    TkinterDnD = None  # type: ignore[assignment, misc]
    _HAS_DND = False


def _make_root_class() -> type:
    """
    Build a root window class that supports both CustomTkinter and DnD.

    When tkinterdnd2 is available we mixin DnDWrapper so folders can be dropped.
    """
    if _HAS_DND:

        class DnDApp(ctk.CTk, TkinterDnD.DnDWrapper):  # type: ignore[misc, valid-type]
            def __init__(self, *args: Any, **kwargs: Any) -> None:
                super().__init__(*args, **kwargs)
                self.TkdndVersion = TkinterDnD._require(self)  # type: ignore[union-attr]

        return DnDApp
    return ctk.CTk


RootWindow = _make_root_class()


class VSCODownloaderApp(RootWindow):  # type: ignore[valid-type, misc]
    """Professional, minimal desktop UI for high-res VSCO downloads."""

    PAD = 18
    ACCENT = "#2BB673"  # calm green — success / primary CTA

    def __init__(self) -> None:
        super().__init__()
        self.config_store = AppConfig()
        self.engine = DownloadEngine()

        ctk.set_appearance_mode(self.config_store.appearance_mode)
        ctk.set_default_color_theme("green")

        self.title(f"{__app_name__}")
        self.geometry(self.config_store.get("window_geometry") or "920x720")
        self.minsize(720, 580)

        self._destination: str = self.config_store.destination
        self._url_count = 0
        self._progress_indeterminate = False

        self._build_ui()
        self._bind_events()
        self._refresh_url_count()
        self._refresh_destination_ui()
        self._update_run_enabled()
        self._check_gallery_dl()

        self.protocol("WM_DELETE_WINDOW", self._on_close)

    # ------------------------------------------------------------------ UI
    def _build_ui(self) -> None:
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(0, weight=1)

        root = ctk.CTkFrame(self, fg_color="transparent")
        root.grid(row=0, column=0, sticky="nsew", padx=self.PAD, pady=(self.PAD, 8))
        root.grid_columnconfigure(0, weight=1)
        root.grid_rowconfigure(1, weight=1)  # URL area grows
        root.grid_rowconfigure(4, weight=1)  # log grows

        self._build_header(root)
        self._build_url_section(root)
        self._build_destination_section(root)
        self._build_actions(root)
        self._build_progress_and_log(root)
        self._build_status_bar()

    def _build_header(self, parent: ctk.CTkFrame) -> None:
        header = ctk.CTkFrame(parent, fg_color="transparent")
        header.grid(row=0, column=0, sticky="ew", pady=(0, 12))
        header.grid_columnconfigure(0, weight=1)

        title = ctk.CTkLabel(
            header,
            text=__app_name__,
            font=ctk.CTkFont(size=22, weight="bold"),
            anchor="w",
        )
        title.grid(row=0, column=0, sticky="w")

        subtitle = ctk.CTkLabel(
            header,
            text="Download original-quality VSCO images & video via gallery-dl",
            font=ctk.CTkFont(size=13),
            text_color=("gray40", "gray65"),
            anchor="w",
        )
        subtitle.grid(row=1, column=0, sticky="w", pady=(2, 0))

        self.theme_btn = ctk.CTkSegmentedButton(
            header,
            values=["System", "Light", "Dark"],
            command=self._on_theme_change,
            width=200,
        )
        mode = self.config_store.appearance_mode.capitalize()
        self.theme_btn.set(mode if mode in {"System", "Light", "Dark"} else "System")
        self.theme_btn.grid(row=0, column=1, rowspan=2, sticky="e", padx=(12, 0))

    def _build_url_section(self, parent: ctk.CTkFrame) -> None:
        section = ctk.CTkFrame(parent, corner_radius=10)
        section.grid(row=1, column=0, sticky="nsew", pady=(0, 12))
        section.grid_columnconfigure(0, weight=1)
        section.grid_rowconfigure(1, weight=1)

        top = ctk.CTkFrame(section, fg_color="transparent")
        top.grid(row=0, column=0, sticky="ew", padx=14, pady=(12, 6))
        top.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            top,
            text="VSCO URLs",
            font=ctk.CTkFont(size=14, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="w")

        self.url_count_label = ctk.CTkLabel(
            top,
            text="0 valid URLs",
            font=ctk.CTkFont(size=12),
            text_color=("gray40", "gray65"),
            anchor="e",
        )
        self.url_count_label.grid(row=0, column=1, sticky="e")

        self.url_box = ctk.CTkTextbox(
            section,
            font=ctk.CTkFont(family="Consolas" if platform.system() == "Windows" else "Menlo", size=13),
            wrap="word",
            height=140,
        )
        self.url_box.grid(row=1, column=0, sticky="nsew", padx=14, pady=(0, 8))
        self.url_box.insert(
            "1.0",
            "Paste one or more VSCO links here…\n"
            "https://vsco.co/username/media/…\n"
            "https://vsco.co/username\n",
        )
        # Select placeholder so first paste replaces it naturally on focus+paste.
        self._url_placeholder = True
        self.url_box.bind("<FocusIn>", self._clear_url_placeholder)

        btn_row = ctk.CTkFrame(section, fg_color="transparent")
        btn_row.grid(row=2, column=0, sticky="ew", padx=14, pady=(0, 12))

        ctk.CTkButton(
            btn_row,
            text="Paste from clipboard",
            width=160,
            command=self._paste_urls,
        ).pack(side="left")

        ctk.CTkButton(
            btn_row,
            text="Clear",
            width=90,
            fg_color=("gray75", "gray35"),
            hover_color=("gray65", "gray45"),
            text_color=("gray10", "gray90"),
            command=self._clear_urls,
        ).pack(side="left", padx=(8, 0))

        hint = ctk.CTkLabel(
            btn_row,
            text="Media, profile, gallery, collection & space URLs supported",
            font=ctk.CTkFont(size=11),
            text_color=("gray45", "gray55"),
            anchor="e",
        )
        hint.pack(side="right")

    def _build_destination_section(self, parent: ctk.CTkFrame) -> None:
        section = ctk.CTkFrame(parent, corner_radius=10)
        section.grid(row=2, column=0, sticky="ew", pady=(0, 12))
        section.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(
            section,
            text="Destination folder",
            font=ctk.CTkFont(size=14, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="w", padx=14, pady=(12, 6))

        self.drop_zone = ctk.CTkFrame(
            section,
            height=88,
            corner_radius=8,
            border_width=2,
            border_color=("gray70", "gray40"),
            fg_color=("gray92", "gray22"),
        )
        self.drop_zone.grid(row=1, column=0, sticky="ew", padx=14, pady=(0, 8))
        self.drop_zone.grid_propagate(False)
        self.drop_zone.grid_columnconfigure(0, weight=1)
        self.drop_zone.grid_rowconfigure(0, weight=1)

        inner = ctk.CTkFrame(self.drop_zone, fg_color="transparent")
        inner.grid(row=0, column=0, sticky="nsew", padx=12, pady=10)
        inner.grid_columnconfigure(1, weight=1)

        self.dest_check = ctk.CTkLabel(
            inner,
            text="",
            width=28,
            font=ctk.CTkFont(size=20),
        )
        self.dest_check.grid(row=0, column=0, rowspan=2, padx=(0, 8))

        self.dest_title = ctk.CTkLabel(
            inner,
            text="Drop a folder here",
            font=ctk.CTkFont(size=14, weight="bold"),
            anchor="w",
        )
        self.dest_title.grid(row=0, column=1, sticky="w")

        self.dest_path_label = ctk.CTkLabel(
            inner,
            text="or use Browse… to pick a download location",
            font=ctk.CTkFont(size=12),
            text_color=("gray40", "gray65"),
            anchor="w",
            wraplength=640,
            justify="left",
        )
        self.dest_path_label.grid(row=1, column=1, sticky="w")

        if _HAS_DND:
            # Register the drop zone (and its children via the frame) for folders.
            self.drop_zone.drop_target_register(DND_FILES)  # type: ignore[attr-defined]
            self.drop_zone.dnd_bind("<<Drop>>", self._on_drop)  # type: ignore[attr-defined]

        btn_row = ctk.CTkFrame(section, fg_color="transparent")
        btn_row.grid(row=2, column=0, sticky="ew", padx=14, pady=(0, 12))

        ctk.CTkButton(
            btn_row,
            text="Browse…",
            width=110,
            command=self._browse_destination,
        ).pack(side="left")

        if not _HAS_DND:
            ctk.CTkLabel(
                btn_row,
                text="Drag & drop unavailable (install tkinterdnd2)",
                font=ctk.CTkFont(size=11),
                text_color=("gray45", "gray55"),
            ).pack(side="left", padx=(10, 0))

    def _build_actions(self, parent: ctk.CTkFrame) -> None:
        row = ctk.CTkFrame(parent, fg_color="transparent")
        row.grid(row=3, column=0, sticky="ew", pady=(0, 12))
        row.grid_columnconfigure(0, weight=1)

        self.run_btn = ctk.CTkButton(
            row,
            text="Download High-Res",
            height=44,
            font=ctk.CTkFont(size=15, weight="bold"),
            fg_color=self.ACCENT,
            hover_color="#239A60",
            command=self._start_download,
            state="disabled",
        )
        self.run_btn.grid(row=0, column=0, sticky="ew")

        self.cancel_btn = ctk.CTkButton(
            row,
            text="Cancel",
            height=44,
            width=110,
            fg_color=("gray70", "gray35"),
            hover_color=("gray60", "gray45"),
            text_color=("gray10", "gray90"),
            command=self._cancel_download,
            state="disabled",
        )
        self.cancel_btn.grid(row=0, column=1, sticky="e", padx=(10, 0))

        self.open_folder_btn = ctk.CTkButton(
            row,
            text="Open folder",
            height=44,
            width=120,
            fg_color="transparent",
            border_width=1,
            border_color=("gray70", "gray40"),
            text_color=("gray20", "gray85"),
            hover_color=("gray90", "gray25"),
            command=self._open_destination,
            state="disabled",
        )
        self.open_folder_btn.grid(row=0, column=2, sticky="e", padx=(8, 0))

    def _build_progress_and_log(self, parent: ctk.CTkFrame) -> None:
        section = ctk.CTkFrame(parent, corner_radius=10)
        section.grid(row=4, column=0, sticky="nsew")
        section.grid_columnconfigure(0, weight=1)
        section.grid_rowconfigure(2, weight=1)

        ctk.CTkLabel(
            section,
            text="Progress & log",
            font=ctk.CTkFont(size=14, weight="bold"),
            anchor="w",
        ).grid(row=0, column=0, sticky="w", padx=14, pady=(12, 6))

        self.progress = ctk.CTkProgressBar(section, height=12)
        self.progress.grid(row=1, column=0, sticky="ew", padx=14, pady=(0, 8))
        self.progress.set(0)

        self.log_box = ctk.CTkTextbox(
            section,
            font=ctk.CTkFont(
                family="Consolas" if platform.system() == "Windows" else "Menlo",
                size=12,
            ),
            wrap="word",
            state="disabled",
        )
        self.log_box.grid(row=2, column=0, sticky="nsew", padx=14, pady=(0, 12))

    def _build_status_bar(self) -> None:
        bar = ctk.CTkFrame(self, height=28, corner_radius=0, fg_color=("gray88", "gray18"))
        bar.grid(row=1, column=0, sticky="ew")
        bar.grid_columnconfigure(0, weight=1)

        self.status_label = ctk.CTkLabel(
            bar,
            text="Ready",
            font=ctk.CTkFont(size=11),
            anchor="w",
            text_color=("gray30", "gray70"),
        )
        self.status_label.grid(row=0, column=0, sticky="ew", padx=12, pady=4)

        version = ctk.CTkLabel(
            bar,
            text=f"v{__version__}",
            font=ctk.CTkFont(size=11),
            anchor="e",
            text_color=("gray45", "gray55"),
        )
        version.grid(row=0, column=1, sticky="e", padx=12, pady=4)

    # -------------------------------------------------------------- Events
    def _bind_events(self) -> None:
        # Live URL counting as the user types / pastes.
        self.url_box.bind("<KeyRelease>", lambda _e: self._refresh_url_count())
        # On some platforms paste is Ctrl-V / Cmd-V — KeyRelease covers it.
        self.bind("<Control-v>", lambda _e: self.after(10, self._refresh_url_count))
        self.bind("<Command-v>", lambda _e: self.after(10, self._refresh_url_count))

    def _clear_url_placeholder(self, _event: object | None = None) -> None:
        if self._url_placeholder:
            self.url_box.delete("1.0", "end")
            self._url_placeholder = False
            self._refresh_url_count()

    def _on_theme_change(self, value: str) -> None:
        mode = value.lower()
        ctk.set_appearance_mode(mode)
        self.config_store.appearance_mode = mode
        self.config_store.save()

    # --------------------------------------------------------------- URLs
    def _current_url_text(self) -> str:
        if self._url_placeholder:
            return ""
        return self.url_box.get("1.0", "end").strip()

    def _valid_urls(self) -> list[str]:
        return extract_vsco_urls(self._current_url_text())

    def _refresh_url_count(self) -> None:
        urls = self._valid_urls()
        self._url_count = len(urls)
        noun = "URL" if self._url_count == 1 else "URLs"
        self.url_count_label.configure(text=f"{self._url_count} valid {noun}")
        self._update_run_enabled()

    def _paste_urls(self) -> None:
        try:
            clip = self.clipboard_get()
        except tk.TclError:
            self._set_status("Clipboard is empty")
            return
        self._clear_url_placeholder()
        existing = self._current_url_text()
        if existing:
            self.url_box.insert("end", "\n" + clip.strip() + "\n")
        else:
            self.url_box.delete("1.0", "end")
            self.url_box.insert("1.0", clip.strip() + "\n")
        self._refresh_url_count()
        self._set_status(f"Pasted from clipboard — {self._url_count} valid URL(s)")

    def _clear_urls(self) -> None:
        self.url_box.delete("1.0", "end")
        self._url_placeholder = False
        self._refresh_url_count()
        self._set_status("URL list cleared")

    # -------------------------------------------------------- Destination
    def _parse_drop_paths(self, data: str) -> list[str]:
        """Parse tkinterdnd2 file-list payload into path strings."""
        # Tcl list style: {/path with spaces} /plain/path
        try:
            return list(self.tk.splitlist(data))
        except tk.TclError:
            return [data.strip().strip("{}")]

    def _on_drop(self, event: Any) -> None:
        paths = self._parse_drop_paths(event.data)
        if not paths:
            return
        folder = Path(paths[0])
        # If a file was dropped, use its parent directory.
        if folder.is_file():
            folder = folder.parent
        if not folder.is_dir():
            messagebox.showerror(__app_name__, f"Not a folder:\n{folder}")
            return
        self._set_destination(str(folder.resolve()))

    def _browse_destination(self) -> None:
        initial = self._destination if self._destination and Path(self._destination).is_dir() else str(Path.home())
        chosen = filedialog.askdirectory(
            title="Choose download folder",
            initialdir=initial,
            mustexist=True,
        )
        if chosen:
            self._set_destination(chosen)

    def _set_destination(self, path: str) -> None:
        self._destination = path
        self.config_store.destination = path
        self.config_store.save()
        self._refresh_destination_ui()
        self._update_run_enabled()
        self._set_status(f"Destination set: {path}")
        if Path(path).is_dir():
            self.open_folder_btn.configure(state="normal")

    def _refresh_destination_ui(self) -> None:
        path = self._destination
        if path and Path(path).is_dir():
            self.dest_check.configure(text="✓", text_color=self.ACCENT)
            self.dest_title.configure(text="Folder selected")
            self.dest_path_label.configure(text=path)
            self.drop_zone.configure(border_color=self.ACCENT)
            self.open_folder_btn.configure(state="normal")
        else:
            self.dest_check.configure(text="")
            self.dest_title.configure(text="Drop a folder here")
            self.dest_path_label.configure(text="or use Browse… to pick a download location")
            self.drop_zone.configure(border_color=("gray70", "gray40"))
            if not (path and Path(path).is_dir()):
                self.open_folder_btn.configure(state="disabled")

    def _open_destination(self) -> None:
        path = self._destination
        if not path or not Path(path).is_dir():
            return
        try:
            system = platform.system()
            if system == "Darwin":
                subprocess.run(["open", path], check=False)
            elif system == "Windows":
                subprocess.run(["explorer", path], check=False)
            else:
                subprocess.run(["xdg-open", path], check=False)
        except OSError as exc:
            messagebox.showerror(__app_name__, f"Could not open folder:\n{exc}")

    # ----------------------------------------------------------- Download
    def _update_run_enabled(self) -> None:
        ready = (
            self._url_count > 0
            and bool(self._destination)
            and Path(self._destination).is_dir()
            and not self.engine.is_running
        )
        self.run_btn.configure(state="normal" if ready else "disabled")

    def _check_gallery_dl(self) -> None:
        if gallery_dl_available():
            self._set_status("Ready — gallery-dl found")
        else:
            self._set_status("Warning: gallery-dl not found — install with pip install gallery-dl")
            self._append_log(
                "gallery-dl was not detected on PATH or as a Python module.\n"
                "Install it with:\n  pip install gallery-dl\n"
            )

    def _start_download(self) -> None:
        urls = self._valid_urls()
        if not urls:
            messagebox.showwarning(__app_name__, "Add at least one valid VSCO URL.")
            return
        dest = self._destination
        if not dest or not Path(dest).is_dir():
            messagebox.showwarning(__app_name__, "Choose a destination folder first.")
            return
        if not gallery_dl_available():
            messagebox.showerror(
                __app_name__,
                "gallery-dl is not installed.\n\nInstall it with:\n  pip install gallery-dl",
            )
            return

        self._clear_log()
        self._append_log(f"Starting download of {len(urls)} URL(s)…")
        self.run_btn.configure(state="disabled")
        self.cancel_btn.configure(state="normal")
        self._set_status("Downloading…")
        self._start_progress()

        try:
            self.engine.start(
                urls,
                dest,
                on_log=self._log_from_thread,
                on_progress=self._progress_from_thread,
                on_done=self._done_from_thread,
            )
        except (FileNotFoundError, NotADirectoryError, PermissionError, ValueError) as exc:
            self._stop_progress()
            self.cancel_btn.configure(state="disabled")
            self._update_run_enabled()
            self._set_status("Error")
            messagebox.showerror(__app_name__, str(exc))

    def _cancel_download(self) -> None:
        self._set_status("Cancelling…")
        self.engine.cancel()
        self.cancel_btn.configure(state="disabled")

    # Thread-safe UI marshaling
    def _log_from_thread(self, message: str) -> None:
        self.after(0, lambda: self._append_log(message))

    def _progress_from_thread(self, current: int, _total: int | None) -> None:
        self.after(0, lambda: self._bump_progress(current))

    def _done_from_thread(self, result: DownloadResult) -> None:
        self.after(0, lambda: self._on_download_done(result))

    def _on_download_done(self, result: DownloadResult) -> None:
        self._stop_progress(complete=result.state == DownloadState.COMPLETED)
        self.cancel_btn.configure(state="disabled")
        self._update_run_enabled()

        summary = (
            f"Finished — {result.successful} successful, "
            f"{result.failed} failed, {result.skipped} skipped"
        )
        if result.state == DownloadState.CANCELLED:
            summary = (
                f"Cancelled — {result.successful} successful, "
                f"{result.failed} failed, {result.skipped} skipped"
            )
            self._set_status("Cancelled")
        elif result.state == DownloadState.FAILED and result.successful == 0:
            self._set_status("Failed")
        else:
            self._set_status("Done")

        self._append_log("—")
        self._append_log(summary)

        # Offer to open the folder after a successful (or partial) run.
        if result.successful > 0 and self._destination:
            open_it = messagebox.askyesno(
                __app_name__,
                f"{summary}\n\nOpen the destination folder?",
            )
            if open_it:
                self._open_destination()
        elif result.state == DownloadState.FAILED:
            messagebox.showwarning(__app_name__, summary)

    # -------------------------------------------------------------- Log UI
    def _append_log(self, message: str) -> None:
        self.log_box.configure(state="normal")
        self.log_box.insert("end", message + "\n")
        self.log_box.see("end")
        self.log_box.configure(state="disabled")

    def _clear_log(self) -> None:
        self.log_box.configure(state="normal")
        self.log_box.delete("1.0", "end")
        self.log_box.configure(state="disabled")

    def _start_progress(self) -> None:
        self._progress_indeterminate = True
        self.progress.configure(mode="indeterminate")
        self.progress.start()

    def _bump_progress(self, current: int) -> None:
        # Keep indeterminate animation while running; status shows count.
        self._set_status(f"Downloading… ({current} file event(s))")

    def _stop_progress(self, complete: bool = False) -> None:
        if self._progress_indeterminate:
            self.progress.stop()
            self.progress.configure(mode="determinate")
            self._progress_indeterminate = False
        self.progress.set(1.0 if complete else 0.0)

    def _set_status(self, text: str) -> None:
        self.status_label.configure(text=text)

    def _on_close(self) -> None:
        if self.engine.is_running:
            if not messagebox.askyesno(
                __app_name__,
                "A download is still running. Cancel and quit?",
            ):
                return
            self.engine.cancel()
        # Remember window size.
        try:
            self.config_store.set("window_geometry", self.geometry())
            self.config_store.save()
        except Exception:  # noqa: BLE001
            pass
        self.destroy()


def main() -> None:
    # On macOS, help Tk find the display; on Linux headless CI, fail gracefully.
    try:
        app = VSCODownloaderApp()
    except tk.TclError as exc:
        print(f"Unable to start GUI: {exc}", file=sys.stderr)
        print(
            "A display is required (local desktop, or X11/Wayland forwarding).",
            file=sys.stderr,
        )
        sys.exit(1)
    app.mainloop()


if __name__ == "__main__":
    main()
