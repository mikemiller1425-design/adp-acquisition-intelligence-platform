"""Shared test helpers (imported by test modules)."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Optional

import numpy as np


class FakeFaceEngine:
    """
    Deterministic stand-in for FaceEngine used by gallery tests.

    Returns ``default_encoding`` for images whose mean pixel value exceeds
    ``face_mean_threshold`` (blank/black images look like "no face").
    """

    def __init__(
        self,
        *,
        default_encoding: Optional[np.ndarray] = None,
        face_mean_threshold: float = 5.0,
    ) -> None:
        self.default_encoding = default_encoding
        self.face_mean_threshold = face_mean_threshold
        self.extract_calls = 0

    def extract_encoding_from_image(
        self,
        image_bgr_or_rgb: np.ndarray,
        *,
        is_rgb: bool = False,
    ) -> Optional[np.ndarray]:
        self.extract_calls += 1
        if image_bgr_or_rgb is None or image_bgr_or_rgb.size == 0:
            return None
        if float(np.mean(image_bgr_or_rgb)) < self.face_mean_threshold:
            return None
        if self.default_encoding is not None:
            return np.asarray(self.default_encoding, dtype=np.float64)
        rng = np.random.default_rng(int(np.sum(image_bgr_or_rgb) % 10_000))
        vec = rng.normal(size=16)
        vec = vec / (np.linalg.norm(vec) + 1e-12)
        return vec.astype(np.float64)


def unit_vec(seed: int, dim: int = 16) -> np.ndarray:
    rng = np.random.default_rng(seed)
    v = rng.normal(size=dim)
    return (v / np.linalg.norm(v)).astype(np.float64)


def make_insight_face(bbox, embedding, *, x_offset: float = 0.0):
    """Minimal object shaped like an InsightFace face result."""
    box = np.asarray(bbox, dtype=np.float32)
    if x_offset:
        box = box.copy()
        box[0] += x_offset
        box[2] += x_offset
    return SimpleNamespace(bbox=box, embedding=embedding)
