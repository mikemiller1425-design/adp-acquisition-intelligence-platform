"""
Face detection, embedding extraction, and matching for FaceMatch Local.

Uses InsightFace (ONNX Runtime) for detection + 512-d ArcFace embeddings and
OpenCV for webcam capture / drawing. Matching is cosine similarity in [0, 1]
so a threshold slider maps naturally to "confidence".

InsightFace is used instead of face_recognition/dlib because it installs cleanly
via pip on Windows/macOS/Linux without a C++ toolchain in most cases.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional, Sequence, Tuple

import cv2
import numpy as np
from insightface.app import FaceAnalysis


@dataclass
class DetectedFace:
    """A single face found in a frame."""

    # (top, right, bottom, left) in original-frame pixel coordinates
    location: Tuple[int, int, int, int]
    encoding: np.ndarray
    label: str = ""


@dataclass
class MatchResult:
    """A ranked gallery match for one live face."""

    filename: str
    score: float  # cosine similarity in [0, 1]; higher = more similar
    face_label: str = ""


def l2_normalize(vec: np.ndarray) -> np.ndarray:
    """Return an L2-normalized copy of a 1-D vector."""
    v = np.asarray(vec, dtype=np.float64).ravel()
    n = float(np.linalg.norm(v))
    if n < 1e-12:
        return v
    return v / n


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    """
    Cosine similarity between two embeddings, clamped to [0, 1].

    Embeddings are L2-normalized first. InsightFace ArcFace vectors are
    typically already unit-length; normalizing again is harmless.
    """
    a = l2_normalize(a)
    b = l2_normalize(b)
    sim = float(np.dot(a, b))
    return float(np.clip(sim, 0.0, 1.0))


def euclidean_distance(a: np.ndarray, b: np.ndarray) -> float:
    """Euclidean (L2) distance between two (optionally normalized) embeddings."""
    return float(np.linalg.norm(l2_normalize(a) - l2_normalize(b)))


class FaceEngine:
    """
    Webcam + face pipeline powered by InsightFace.

    Detection can run on a downscaled copy of the frame for speed; bounding
    boxes are scaled back to the full-resolution frame for drawing.
    """

    def __init__(
        self,
        camera_index: int = 0,
        process_scale: float = 0.5,
        model_name: str = "buffalo_sc",
        det_size: Tuple[int, int] = (320, 320),
    ) -> None:
        """
        Args:
            camera_index: OpenCV camera device index.
            process_scale: Fraction of frame size used for detection (0.5 ≈ 2x speedup).
            model_name: InsightFace model pack. ``buffalo_sc`` is small (~16MB) and fast.
            det_size: Detector input size passed to InsightFace ``prepare``.
        """
        self.camera_index = camera_index
        self.process_scale = max(0.25, min(1.0, process_scale))
        self.model_name = model_name
        self.det_size = det_size
        self._cap: Optional[cv2.VideoCapture] = None
        self._app: Optional[FaceAnalysis] = None
        self._last_faces: List[DetectedFace] = []

    # --------------------------------------------------------------- models

    def load_models(self) -> None:
        """
        Initialize InsightFace (downloads model pack on first run into
        ``~/.insightface/models``).
        """
        if self._app is not None:
            return
        app = FaceAnalysis(
            name=self.model_name,
            providers=["CPUExecutionProvider"],
        )
        # ctx_id=-1 → CPU
        app.prepare(ctx_id=-1, det_size=self.det_size)
        self._app = app

    @property
    def models_ready(self) -> bool:
        return self._app is not None

    # ------------------------------------------------------------------ camera

    def open_camera(self) -> None:
        """Open the webcam. Raises RuntimeError if the device cannot be opened."""
        self.close_camera()
        cap = cv2.VideoCapture(self.camera_index)
        if not cap.isOpened():
            raise RuntimeError(
                f"Could not open camera index {self.camera_index}. "
                "Check that a webcam is connected and not used by another app."
            )
        # Modest resolution keeps interactive FPS on typical laptops.
        cap.set(cv2.CAP_PROP_FRAME_WIDTH, 640)
        cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 480)
        self._cap = cap

    def close_camera(self) -> None:
        """Release the webcam if open."""
        if self._cap is not None:
            self._cap.release()
            self._cap = None

    @property
    def is_open(self) -> bool:
        return self._cap is not None and self._cap.isOpened()

    def read_frame(self) -> Optional[np.ndarray]:
        """
        Grab one BGR frame from the webcam.

        Returns:
            BGR image array, or None if the camera failed / is closed.
        """
        if not self.is_open:
            return None
        ok, frame = self._cap.read()  # type: ignore[union-attr]
        if not ok or frame is None:
            return None
        return frame

    # ----------------------------------------------------------- face pipeline

    def _ensure_app(self) -> FaceAnalysis:
        if self._app is None:
            self.load_models()
        assert self._app is not None
        return self._app

    @staticmethod
    def _insight_to_detected(face, scale: float, index: int) -> Optional[DetectedFace]:
        """Convert an InsightFace result to DetectedFace in full-frame coords."""
        if face.embedding is None:
            return None
        x1, y1, x2, y2 = [float(v) for v in face.bbox]
        inv = 1.0 / scale
        left = int(x1 * inv)
        top = int(y1 * inv)
        right = int(x2 * inv)
        bottom = int(y2 * inv)
        return DetectedFace(
            location=(top, right, bottom, left),
            encoding=l2_normalize(np.asarray(face.embedding, dtype=np.float64)),
            label=f"Face {index + 1}",
        )

    def detect_faces(
        self,
        frame_bgr: np.ndarray,
        *,
        reuse_last: bool = False,
    ) -> List[DetectedFace]:
        """
        Detect faces and compute embeddings.

        Args:
            frame_bgr: OpenCV BGR frame.
            reuse_last: If True, return the previous detection list without
                re-running the model (useful when skipping frames for FPS).

        Returns:
            List of DetectedFace (may be empty if no faces found).
        """
        if reuse_last:
            return list(self._last_faces)

        if frame_bgr is None or frame_bgr.size == 0:
            self._last_faces = []
            return []

        app = self._ensure_app()
        scale = self.process_scale
        if scale < 1.0:
            small = cv2.resize(frame_bgr, (0, 0), fx=scale, fy=scale)
        else:
            small = frame_bgr

        raw_faces = app.get(small)
        # Sort left→right so "Face 1/2/…" labels are stable across frames.
        raw_faces = sorted(raw_faces, key=lambda f: float(f.bbox[0]))

        faces: List[DetectedFace] = []
        for i, face in enumerate(raw_faces):
            detected = self._insight_to_detected(face, scale, i)
            if detected is not None:
                faces.append(detected)

        self._last_faces = faces
        return faces

    def extract_encoding_from_image(self, image_bgr_or_rgb: np.ndarray, *, is_rgb: bool = False) -> Optional[np.ndarray]:
        """
        Extract a single face encoding from an image.

        If multiple faces are present, the largest (by bounding-box area) is used.
        Returns None when no face is found.

        Args:
            image_bgr_or_rgb: HxWx3 image array.
            is_rgb: Set True when the image is RGB (e.g. from Pillow); converted to BGR for InsightFace.
        """
        if image_bgr_or_rgb is None or image_bgr_or_rgb.size == 0:
            return None

        app = self._ensure_app()
        img = image_bgr_or_rgb
        if is_rgb:
            img = cv2.cvtColor(img, cv2.COLOR_RGB2BGR)

        faces = app.get(img)
        if not faces:
            return None

        def _area(f) -> float:
            x1, y1, x2, y2 = f.bbox
            return max(0.0, float(x2 - x1)) * max(0.0, float(y2 - y1))

        best = max(faces, key=_area)
        if best.embedding is None:
            return None
        return l2_normalize(np.asarray(best.embedding, dtype=np.float64))

    def match_faces(
        self,
        faces: Sequence[DetectedFace],
        gallery_names: Sequence[str],
        gallery_encodings: Sequence[np.ndarray],
        threshold: float = 0.40,
        top_n: int = 5,
    ) -> List[MatchResult]:
        """
        Compare every live face against every gallery encoding.

        Args:
            faces: Live detections.
            gallery_names: Filenames parallel to gallery_encodings.
            gallery_encodings: Cached embedding vectors.
            threshold: Minimum cosine similarity to include (0–1).
            top_n: Max matches returned per live face (then flattened/ranked).

        Returns:
            Flat list of MatchResult sorted by score descending (across all faces).
        """
        if not faces or not gallery_encodings:
            return []

        names = list(gallery_names)
        encs = [l2_normalize(e) for e in gallery_encodings]
        results: List[MatchResult] = []

        for face in faces:
            scored: List[MatchResult] = []
            for name, genc in zip(names, encs):
                score = cosine_similarity(face.encoding, genc)
                if score >= threshold:
                    scored.append(
                        MatchResult(
                            filename=name,
                            score=score,
                            face_label=face.label,
                        )
                    )
            scored.sort(key=lambda m: m.score, reverse=True)
            results.extend(scored[: max(1, top_n)])

        results.sort(key=lambda m: m.score, reverse=True)
        return results

    # ---------------------------------------------------------------- drawing

    def draw_annotations(
        self,
        frame_bgr: np.ndarray,
        faces: Sequence[DetectedFace],
        matches: Sequence[MatchResult],
        threshold: float,
    ) -> np.ndarray:
        """
        Draw bounding boxes and best-match labels onto a copy of the frame.

        Each face gets its own color and the best gallery hit (if any above
        threshold) is printed above the box.
        """
        out = frame_bgr.copy()
        best_by_face = {}
        for m in matches:
            if m.face_label not in best_by_face or m.score > best_by_face[m.face_label].score:
                best_by_face[m.face_label] = m

        colors = [
            (40, 180, 80),
            (80, 160, 255),
            (200, 120, 40),
            (180, 80, 200),
            (60, 200, 200),
        ]

        for i, face in enumerate(faces):
            top, right, bottom, left = face.location
            color = colors[i % len(colors)]
            cv2.rectangle(out, (left, top), (right, bottom), color, 2)

            best = best_by_face.get(face.label)
            if best and best.score >= threshold:
                text = f"{face.label}: {best.filename} ({best.score:.2f})"
            else:
                text = f"{face.label}: no match"

            (tw, th), _baseline = cv2.getTextSize(text, cv2.FONT_HERSHEY_SIMPLEX, 0.5, 1)
            y1 = max(0, top - th - 8)
            cv2.rectangle(out, (left, y1), (left + tw + 6, top), color, cv2.FILLED)
            cv2.putText(
                out,
                text,
                (left + 3, top - 4),
                cv2.FONT_HERSHEY_SIMPLEX,
                0.5,
                (0, 0, 0),
                1,
                cv2.LINE_AA,
            )

        return out
