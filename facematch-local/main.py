"""
FaceMatch Local — entry point and GUI.

Real-time webcam face matching against a local folder of reference images.
Built with CustomTkinter + OpenCV + face_recognition.
"""

from __future__ import annotations

import sys
import threading
import tkinter as tk
from pathlib import Path
from tkinter import filedialog, messagebox
from typing import List, Optional

import cv2
import customtkinter as ctk
import numpy as np
from PIL import Image, ImageTk

from face_engine import DetectedFace, FaceEngine, MatchResult
from gallery_manager import GalleryManager

# Default gallery sits next to this script so the app is portable.
APP_DIR = Path(__file__).resolve().parent
DEFAULT_GALLERY = APP_DIR / "gallery"

# Process every Nth frame with the face model; draw cached boxes in between.
DETECT_EVERY_N_FRAMES = 2
TOP_N_MATCHES = 5
PREVIEW_MAX_WIDTH = 720
PREVIEW_MAX_HEIGHT = 540


class FaceMatchApp(ctk.CTk):
    """Main application window."""

    def __init__(self) -> None:
        super().__init__()

        ctk.set_appearance_mode("System")
        ctk.set_default_color_theme("blue")

        self.title("FaceMatch Local")
        self.geometry("1100x720")
        self.minsize(900, 600)

        self.engine = FaceEngine(
            camera_index=0,
            process_scale=0.5,
            model_name="buffalo_sc",
            det_size=(320, 320),
        )
        self.gallery = GalleryManager(DEFAULT_GALLERY, self.engine)

        self._running = False
        self._frame_count = 0
        self._latest_frame: Optional[np.ndarray] = None
        self._latest_faces: List[DetectedFace] = []
        self._latest_matches: List[MatchResult] = []
        self._photo: Optional[ImageTk.PhotoImage] = None
        self._gallery_busy = False
        self._status_var = tk.StringVar(value="Starting…")
        # InsightFace cosine similarity: ~0.35–0.50 is a typical same-person band.
        self._threshold_var = tk.DoubleVar(value=0.40)
        self._gallery_path_var = tk.StringVar(value=str(DEFAULT_GALLERY))

        self._build_ui()
        self.protocol("WM_DELETE_WINDOW", self._on_close)

        # Defer camera + gallery init so the window appears immediately.
        self.after(100, self._startup)

    # ------------------------------------------------------------------ UI

    def _build_ui(self) -> None:
        self.grid_columnconfigure(0, weight=3)
        self.grid_columnconfigure(1, weight=2)
        self.grid_rowconfigure(0, weight=1)
        self.grid_rowconfigure(1, weight=0)

        # ---- left: video preview ----
        left = ctk.CTkFrame(self)
        left.grid(row=0, column=0, sticky="nsew", padx=(12, 6), pady=12)
        left.grid_rowconfigure(1, weight=1)
        left.grid_columnconfigure(0, weight=1)

        ctk.CTkLabel(left, text="Live webcam", font=ctk.CTkFont(size=16, weight="bold")).grid(
            row=0, column=0, sticky="w", padx=12, pady=(10, 4)
        )

        self.video_label = ctk.CTkLabel(left, text="Opening camera…", anchor="center")
        self.video_label.grid(row=1, column=0, sticky="nsew", padx=12, pady=8)

        # ---- right: controls + matches ----
        right = ctk.CTkFrame(self)
        right.grid(row=0, column=1, sticky="nsew", padx=(6, 12), pady=12)
        right.grid_columnconfigure(0, weight=1)
        right.grid_rowconfigure(5, weight=1)

        ctk.CTkLabel(right, text="Gallery & matching", font=ctk.CTkFont(size=16, weight="bold")).grid(
            row=0, column=0, sticky="w", padx=12, pady=(10, 4)
        )

        path_row = ctk.CTkFrame(right, fg_color="transparent")
        path_row.grid(row=1, column=0, sticky="ew", padx=12, pady=4)
        path_row.grid_columnconfigure(0, weight=1)

        self.gallery_entry = ctk.CTkEntry(path_row, textvariable=self._gallery_path_var)
        self.gallery_entry.grid(row=0, column=0, sticky="ew", padx=(0, 6))
        ctk.CTkButton(path_row, text="Browse…", width=90, command=self._browse_gallery).grid(
            row=0, column=1
        )

        btn_row = ctk.CTkFrame(right, fg_color="transparent")
        btn_row.grid(row=2, column=0, sticky="ew", padx=12, pady=8)
        btn_row.grid_columnconfigure((0, 1), weight=1)

        self.refresh_btn = ctk.CTkButton(
            btn_row, text="Refresh gallery embeddings", command=self._refresh_gallery
        )
        self.refresh_btn.grid(row=0, column=0, sticky="ew", padx=(0, 4))

        self.save_btn = ctk.CTkButton(
            btn_row, text="Save current face to gallery", command=self._save_current_face
        )
        self.save_btn.grid(row=0, column=1, sticky="ew", padx=(4, 0))

        # Threshold slider
        thresh_frame = ctk.CTkFrame(right, fg_color="transparent")
        thresh_frame.grid(row=3, column=0, sticky="ew", padx=12, pady=4)
        thresh_frame.grid_columnconfigure(1, weight=1)

        ctk.CTkLabel(thresh_frame, text="Threshold").grid(row=0, column=0, sticky="w")
        self.threshold_slider = ctk.CTkSlider(
            thresh_frame,
            from_=0.0,
            to=1.0,
            number_of_steps=100,
            variable=self._threshold_var,
            command=self._on_threshold_change,
        )
        self.threshold_slider.grid(row=0, column=1, sticky="ew", padx=8)
        self.threshold_value_label = ctk.CTkLabel(thresh_frame, text="0.40", width=40)
        self.threshold_value_label.grid(row=0, column=2, sticky="e")

        ctk.CTkLabel(
            right,
            text="Top matches (cosine similarity)",
            font=ctk.CTkFont(size=13, weight="bold"),
        ).grid(row=4, column=0, sticky="nw", padx=12, pady=(12, 2))

        self.match_box = ctk.CTkTextbox(right, font=ctk.CTkFont(family="Consolas", size=13))
        self.match_box.grid(row=5, column=0, sticky="nsew", padx=12, pady=(0, 12))
        self.match_box.insert("1.0", "No matches yet.\n")
        self.match_box.configure(state="disabled")

        # ---- status bar ----
        status = ctk.CTkLabel(self, textvariable=self._status_var, anchor="w")
        status.grid(row=1, column=0, columnspan=2, sticky="ew", padx=16, pady=(0, 10))

    # -------------------------------------------------------------- startup

    def _startup(self) -> None:
        self._set_status("Loading face models (first run may download ~16MB)…")
        self.update_idletasks()
        try:
            self.engine.load_models()
        except Exception as exc:  # noqa: BLE001
            msg = f"Failed to load InsightFace models: {exc}"
            self._set_status(msg)
            messagebox.showerror("Model error", msg)
            return

        try:
            self.engine.open_camera()
            self._set_status("Camera opened. Loading gallery…")
        except RuntimeError as exc:
            self._set_status(str(exc))
            messagebox.showerror("Camera error", str(exc))
            self.video_label.configure(text="Camera unavailable")
            # Still allow gallery management without a camera.
            self._load_gallery_async(force=False)
            return

        self._load_gallery_async(force=False)
        self._running = True
        self._update_loop()

    def _load_gallery_async(self, force: bool) -> None:
        if self._gallery_busy:
            return
        self._gallery_busy = True
        self.refresh_btn.configure(state="disabled")
        path = Path(self._gallery_path_var.get().strip() or str(DEFAULT_GALLERY))
        self.gallery = GalleryManager(path, self.engine)

        def worker() -> None:
            try:
                report = self.gallery.load(force_recompute=force)
                msg = report.message
            except Exception as exc:  # noqa: BLE001
                msg = f"Gallery load failed: {exc}"

            def done() -> None:
                self._gallery_busy = False
                self.refresh_btn.configure(state="normal")
                self._set_status(msg)
                if self.gallery.is_empty:
                    self._write_matches_text(
                        "Gallery is empty.\n"
                        "Add jpg/png images to the gallery folder,\n"
                        "or use “Save current face to gallery”."
                    )

            self.after(0, done)

        threading.Thread(target=worker, daemon=True).start()

    # ---------------------------------------------------------------- loop

    def _update_loop(self) -> None:
        if not self._running:
            return

        frame = self.engine.read_frame()
        if frame is None:
            self._set_status("Camera read failed — is the webcam still connected?")
            self.video_label.configure(text="No camera frame")
            self.after(200, self._update_loop)
            return

        self._latest_frame = frame
        self._frame_count += 1
        reuse = (self._frame_count % DETECT_EVERY_N_FRAMES) != 0

        try:
            faces = self.engine.detect_faces(frame, reuse_last=reuse)
        except Exception as exc:  # noqa: BLE001
            self._set_status(f"Detection error: {exc}")
            faces = []

        self._latest_faces = faces
        threshold = float(self._threshold_var.get())

        if faces and not self.gallery.is_empty:
            matches = self.engine.match_faces(
                faces,
                self.gallery.names,
                self.gallery.encodings,
                threshold=threshold,
                top_n=TOP_N_MATCHES,
            )
        else:
            matches = []
        self._latest_matches = matches

        annotated = self.engine.draw_annotations(frame, faces, matches, threshold)
        self._show_frame(annotated)
        self._update_match_list(faces, matches)

        # Target ~15–30 UI updates/sec; detection already downscaled + skipped.
        self.after(30, self._update_loop)

    def _show_frame(self, frame_bgr: np.ndarray) -> None:
        rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        h, w = rgb.shape[:2]
        scale = min(PREVIEW_MAX_WIDTH / w, PREVIEW_MAX_HEIGHT / h, 1.0)
        if scale < 1.0:
            rgb = cv2.resize(rgb, (int(w * scale), int(h * scale)))
        image = Image.fromarray(rgb)
        self._photo = ImageTk.PhotoImage(image=image)
        self.video_label.configure(image=self._photo, text="")

    def _update_match_list(self, faces: List[DetectedFace], matches: List[MatchResult]) -> None:
        lines: List[str] = []
        if not faces:
            lines.append("No face detected in frame.")
        elif self.gallery.is_empty:
            lines.append("Gallery empty — nothing to match against.")
        elif not matches:
            lines.append(
                f"{len(faces)} face(s) detected; no gallery hits ≥ "
                f"{float(self._threshold_var.get()):.2f}."
            )
        else:
            lines.append(f"{'Score':>6}  {'Live face':<10}  Gallery file")
            lines.append("-" * 48)
            for m in matches:
                lines.append(f"{m.score:6.3f}  {m.face_label:<10}  {m.filename}")

        self._write_matches_text("\n".join(lines))

    def _write_matches_text(self, text: str) -> None:
        self.match_box.configure(state="normal")
        self.match_box.delete("1.0", "end")
        self.match_box.insert("1.0", text)
        self.match_box.configure(state="disabled")

    # ------------------------------------------------------------- actions

    def _on_threshold_change(self, value: float) -> None:
        self.threshold_value_label.configure(text=f"{float(value):.2f}")

    def _browse_gallery(self) -> None:
        path = filedialog.askdirectory(
            title="Select gallery folder",
            initialdir=self._gallery_path_var.get() or str(DEFAULT_GALLERY),
        )
        if path:
            self._gallery_path_var.set(path)
            self._refresh_gallery()

    def _refresh_gallery(self) -> None:
        self._set_status("Refreshing gallery embeddings…")
        self._load_gallery_async(force=True)

    def _save_current_face(self) -> None:
        if self._latest_frame is None:
            messagebox.showwarning("Save face", "No webcam frame available yet.")
            return

        # Prefer the largest currently detected face encoding for consistency.
        encoding = None
        if self._latest_faces:
            def area(f: DetectedFace) -> int:
                t, r, b, l = f.location
                return max(0, b - t) * max(0, r - l)

            encoding = max(self._latest_faces, key=area).encoding

        filename, msg = self.gallery.save_face_image(self._latest_frame, encoding=encoding)
        self._set_status(msg)
        if filename is None:
            messagebox.showinfo("Save face", msg)
        else:
            # Update match list context immediately
            if self.gallery.is_empty:
                self._write_matches_text("Gallery still empty.")

    def _set_status(self, text: str) -> None:
        self._status_var.set(text)

    def _on_close(self) -> None:
        self._running = False
        try:
            self.engine.close_camera()
        except Exception:  # noqa: BLE001
            pass
        self.destroy()


def main() -> None:
    # Helpful message if optional deps are missing at runtime.
    try:
        import insightface  # noqa: F401
        import onnxruntime  # noqa: F401
    except ImportError:
        print(
            "Missing dependency: insightface / onnxruntime\n"
            "Install with: pip install -r requirements.txt\n"
            "See README.md for platform-specific tips.",
            file=sys.stderr,
        )
        sys.exit(1)

    # Ensure default gallery exists so the path is valid out of the box.
    DEFAULT_GALLERY.mkdir(parents=True, exist_ok=True)
    # Drop a tiny placeholder note (not an image) — gallery load ignores non-images.
    readme_note = DEFAULT_GALLERY / "README.txt"
    if not readme_note.exists():
        readme_note.write_text(
            "Place jpg/png reference photos here, or use "
            "“Save current face to gallery” in the app.\n",
            encoding="utf-8",
        )

    app = FaceMatchApp()
    app.mainloop()


if __name__ == "__main__":
    main()
