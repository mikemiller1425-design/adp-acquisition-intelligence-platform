"""
Gallery folder management for FaceMatch Local.

Loads jpg/png images from a local directory, extracts face embeddings via
FaceEngine, and caches them next to the gallery as embeddings_cache.npz so
startup / refresh is fast when files have not changed.
"""

from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Tuple

import numpy as np
from PIL import Image

from app_logic import sanitize_basename
from face_engine import FaceEngine


IMAGE_EXTENSIONS = {".jpg", ".jpeg", ".png", ".bmp", ".webp"}
CACHE_FILENAME = "embeddings_cache.npz"


@dataclass
class GalleryEntry:
    """One reference face in the gallery."""

    filename: str
    encoding: np.ndarray
    path: str


@dataclass
class GalleryLoadReport:
    """Summary returned after loading / refreshing the gallery."""

    loaded: int = 0
    skipped_no_face: List[str] = field(default_factory=list)
    skipped_error: List[str] = field(default_factory=list)
    from_cache: bool = False
    message: str = ""


class GalleryManager:
    """Load, cache, and update a folder of reference face images."""

    def __init__(self, gallery_dir: str | Path, engine: FaceEngine) -> None:
        self.gallery_dir = Path(gallery_dir)
        self.engine = engine
        self.entries: List[GalleryEntry] = []
        self._cache_path = self.gallery_dir / CACHE_FILENAME

    # ----------------------------------------------------------------- paths

    def ensure_dir(self) -> None:
        """Create the gallery directory if it does not exist."""
        self.gallery_dir.mkdir(parents=True, exist_ok=True)

    def list_image_files(self) -> List[Path]:
        """Return sorted image paths in the gallery (non-recursive)."""
        if not self.gallery_dir.is_dir():
            return []
        files = [
            p
            for p in self.gallery_dir.iterdir()
            if p.is_file() and p.suffix.lower() in IMAGE_EXTENSIONS
        ]
        return sorted(files, key=lambda p: p.name.lower())

    # ----------------------------------------------------------------- cache

    def _file_fingerprint(self, paths: List[Path]) -> str:
        """
        Build a cheap fingerprint of gallery image names + sizes + mtimes
        so we can invalidate the cache when the folder changes.
        """
        h = hashlib.sha256()
        for p in paths:
            try:
                st = p.stat()
                h.update(p.name.encode("utf-8", errors="replace"))
                h.update(str(st.st_size).encode())
                h.update(str(int(st.st_mtime)).encode())
            except OSError:
                h.update(p.name.encode("utf-8", errors="replace"))
        return h.hexdigest()

    def _load_cache(self, fingerprint: str) -> Optional[Tuple[List[str], np.ndarray]]:
        """Return (names, encodings) if a matching cache exists, else None."""
        if not self._cache_path.is_file():
            return None
        try:
            data = np.load(self._cache_path, allow_pickle=True)
            if str(data.get("fingerprint", "")) != fingerprint:
                return None
            names = [str(n) for n in data["names"].tolist()]
            encodings = np.asarray(data["encodings"], dtype=np.float64)
            if encodings.ndim != 2 or len(names) != encodings.shape[0]:
                return None
            return names, encodings
        except Exception:
            return None

    def _save_cache(self, fingerprint: str, names: List[str], encodings: np.ndarray) -> None:
        """Persist embeddings next to the gallery folder."""
        self.ensure_dir()
        np.savez_compressed(
            self._cache_path,
            fingerprint=np.asarray(fingerprint),
            names=np.asarray(names, dtype=object),
            encodings=np.asarray(encodings, dtype=np.float64),
        )

    # ----------------------------------------------------------------- load

    def load(self, *, force_recompute: bool = False) -> GalleryLoadReport:
        """
        Load gallery embeddings, using disk cache when possible.

        Args:
            force_recompute: Ignore cache and re-extract every image.

        Returns:
            GalleryLoadReport with counts and skip reasons.
        """
        report = GalleryLoadReport()
        self.ensure_dir()
        paths = self.list_image_files()

        if not paths:
            self.entries = []
            report.message = (
                f"Gallery is empty. Add jpg/png images to:\n{self.gallery_dir.resolve()}"
            )
            return report

        fingerprint = self._file_fingerprint(paths)

        if not force_recompute:
            cached = self._load_cache(fingerprint)
            if cached is not None:
                names, encodings = cached
                self.entries = [
                    GalleryEntry(
                        filename=name,
                        encoding=encodings[i],
                        path=str(self.gallery_dir / name),
                    )
                    for i, name in enumerate(names)
                ]
                report.loaded = len(self.entries)
                report.from_cache = True
                report.message = f"Loaded {report.loaded} face(s) from cache."
                return report

        names: List[str] = []
        vectors: List[np.ndarray] = []

        for path in paths:
            try:
                image = Image.open(path).convert("RGB")
                rgb = np.asarray(image)
                encoding = self.engine.extract_encoding_from_image(rgb, is_rgb=True)
                if encoding is None:
                    report.skipped_no_face.append(path.name)
                    continue
                names.append(path.name)
                vectors.append(encoding)
            except Exception as exc:  # noqa: BLE001 — collect per-file errors for the UI
                report.skipped_error.append(f"{path.name} ({exc})")

        self.entries = [
            GalleryEntry(
                filename=name,
                encoding=vectors[i],
                path=str(self.gallery_dir / name),
            )
            for i, name in enumerate(names)
        ]

        if vectors:
            stacked = np.stack(vectors, axis=0)
            # Fingerprint after successful extract so cache matches current files
            # that produced embeddings (skipped files still affect folder listing —
            # use original fingerprint of all images so adding a no-face image
            # still invalidates and retries).
            self._save_cache(fingerprint, names, stacked)

        report.loaded = len(self.entries)
        report.from_cache = False
        parts = [f"Extracted {report.loaded} face embedding(s)."]
        if report.skipped_no_face:
            parts.append(f"No face in: {', '.join(report.skipped_no_face)}")
        if report.skipped_error:
            parts.append(f"Errors: {', '.join(report.skipped_error)}")
        report.message = " ".join(parts)
        return report

    # ----------------------------------------------------------------- query

    @property
    def names(self) -> List[str]:
        return [e.filename for e in self.entries]

    @property
    def encodings(self) -> List[np.ndarray]:
        return [e.encoding for e in self.entries]

    @property
    def is_empty(self) -> bool:
        return len(self.entries) == 0

    # ----------------------------------------------------------------- save

    def save_face_image(
        self,
        frame_bgr: np.ndarray,
        encoding: Optional[np.ndarray] = None,
        basename: Optional[str] = None,
    ) -> Tuple[Optional[str], str]:
        """
        Save a webcam BGR frame as a new gallery reference image.

        Also appends the embedding immediately (and refreshes the cache) so
        matching can use the new face without a full re-scan.

        Args:
            frame_bgr: OpenCV BGR frame to save.
            encoding: Optional precomputed encoding; extracted from the frame if omitted.
            basename: Optional filename stem; timestamp used when None.

        Returns:
            (saved_filename_or_None, status_message)
        """
        self.ensure_dir()

        if frame_bgr is None or frame_bgr.size == 0:
            return None, "No frame available to save."

        # Convert BGR -> RGB for Pillow save; InsightFace wants BGR for encoding.
        rgb = frame_bgr[:, :, ::-1].copy()

        if encoding is None:
            encoding = self.engine.extract_encoding_from_image(frame_bgr, is_rgb=False)
        if encoding is None:
            return None, "No face found in the current frame. Look at the camera and try again."

        stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        safe = sanitize_basename(basename, fallback=f"capture_{stamp}")
        filename = f"{safe}.jpg"
        dest = self.gallery_dir / filename
        # Avoid overwrite
        n = 1
        while dest.exists():
            filename = f"{safe}_{n}.jpg"
            dest = self.gallery_dir / filename
            n += 1

        try:
            Image.fromarray(rgb).save(dest, format="JPEG", quality=92)
        except Exception as exc:  # noqa: BLE001
            return None, f"Failed to save image: {exc}"

        self.entries.append(
            GalleryEntry(filename=filename, encoding=np.asarray(encoding), path=str(dest))
        )
        # Drop stale entries whose files were removed from disk, then rewrite cache.
        self._sync_entries_to_disk()
        paths = self.list_image_files()
        fingerprint = self._file_fingerprint(paths)
        if self.entries:
            self._save_cache(
                fingerprint,
                self.names,
                np.stack(self.encodings, axis=0),
            )

        return filename, f"Saved {filename} to gallery ({len(self.entries)} face(s) total)."

    def _sync_entries_to_disk(self) -> None:
        """Keep in-memory entries aligned with image files still on disk."""
        existing = {p.name for p in self.list_image_files()}
        self.entries = [e for e in self.entries if e.filename in existing]
