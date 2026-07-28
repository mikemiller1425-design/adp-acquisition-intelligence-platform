"""Tests for pure GUI/app helpers (no tkinter)."""

from __future__ import annotations

import numpy as np
import pytest

from app_logic import (
    format_match_list_text,
    largest_face,
    preview_scale,
    sanitize_basename,
    should_reuse_detections,
)
from face_engine import DetectedFace, MatchResult


def _face(label: str, box, seed: int = 0) -> DetectedFace:
    rng = np.random.default_rng(seed)
    enc = rng.normal(size=8)
    enc = enc / np.linalg.norm(enc)
    return DetectedFace(location=box, encoding=enc, label=label)


class TestFormatMatchListText:
    def test_no_faces(self):
        text = format_match_list_text([], [], gallery_empty=False, threshold=0.4)
        assert text == "No face detected in frame."

    def test_gallery_empty_takes_priority_when_faces_present(self):
        faces = [_face("Face 1", (10, 40, 50, 10))]
        text = format_match_list_text(faces, [], gallery_empty=True, threshold=0.4)
        assert "Gallery empty" in text

    def test_faces_but_no_hits_includes_threshold(self):
        faces = [_face("Face 1", (10, 40, 50, 10)), _face("Face 2", (10, 80, 50, 50), 1)]
        text = format_match_list_text(faces, [], gallery_empty=False, threshold=0.65)
        assert "2 face(s) detected" in text
        assert "0.65" in text

    def test_ranked_table_formatting(self):
        faces = [_face("Face 1", (10, 40, 50, 10))]
        matches = [
            MatchResult(filename="alice.jpg", score=0.9123, face_label="Face 1"),
            MatchResult(filename="bob.png", score=0.801, face_label="Face 1"),
        ]
        text = format_match_list_text(faces, matches, gallery_empty=False, threshold=0.4)
        lines = text.splitlines()
        assert "Score" in lines[0]
        assert "alice.jpg" in lines[2]
        assert "0.912" in lines[2]
        assert "bob.png" in lines[3]

    def test_no_faces_wins_over_empty_gallery_flag(self):
        text = format_match_list_text([], [], gallery_empty=True, threshold=0.4)
        assert text == "No face detected in frame."


class TestLargestFace:
    def test_empty(self):
        assert largest_face([]) is None

    def test_picks_largest_area(self):
        small = _face("Face 1", (0, 10, 10, 0), 0)  # 10x10
        large = _face("Face 2", (0, 100, 50, 0), 1)  # 100x50
        mid = _face("Face 3", (0, 40, 40, 0), 2)  # 40x40
        assert largest_face([small, large, mid]) is large

    def test_zero_area_boxes_still_returns_one(self):
        a = _face("Face 1", (5, 5, 5, 5), 0)
        b = _face("Face 2", (5, 5, 5, 5), 1)
        assert largest_face([a, b]) in (a, b)


class TestSanitizeBasename:
    def test_none_uses_fallback(self):
        assert sanitize_basename(None, "capture_x") == "capture_x"

    def test_empty_and_whitespace(self):
        assert sanitize_basename("", "fb") == "fb"
        assert sanitize_basename("   ", "fb") == "fb"

    def test_keeps_alnum_dash_underscore(self):
        assert sanitize_basename("Alice-01_face", "fb") == "Alice-01_face"

    def test_replaces_unsafe_chars(self):
        assert sanitize_basename("my face!!!.jpg", "fb") == "my_face____jpg"

    def test_symbols_only_falls_back(self):
        assert sanitize_basename("@@@", "fb") == "fb"


class TestShouldReuseDetections:
    def test_every_n_one_never_reuses(self):
        for n in range(1, 6):
            assert should_reuse_detections(n, 1) is False

    def test_every_n_two_pattern(self):
        # Frames 1,3,5 detect; 2,4,6 reuse
        assert should_reuse_detections(1, 2) is False
        assert should_reuse_detections(2, 2) is True
        assert should_reuse_detections(3, 2) is False
        assert should_reuse_detections(4, 2) is True

    def test_every_n_three_pattern(self):
        assert should_reuse_detections(1, 3) is False
        assert should_reuse_detections(2, 3) is True
        assert should_reuse_detections(3, 3) is True
        assert should_reuse_detections(4, 3) is False

    def test_non_positive_frame_or_n(self):
        assert should_reuse_detections(0, 2) is False
        assert should_reuse_detections(-1, 2) is False
        assert should_reuse_detections(2, 0) is False


class TestPreviewScale:
    def test_no_upscale(self):
        assert preview_scale(100, 100, 720, 540) == 1.0

    def test_fits_width(self):
        assert preview_scale(1440, 100, 720, 540) == pytest.approx(0.5)

    def test_fits_height(self):
        assert preview_scale(100, 1080, 720, 540) == pytest.approx(0.5)

    def test_invalid_dims(self):
        assert preview_scale(0, 100, 720, 540) == 1.0
        assert preview_scale(100, -1, 720, 540) == 1.0
