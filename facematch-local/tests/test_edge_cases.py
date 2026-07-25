"""Extra edge-case and regression tests discovered during deep review."""

from __future__ import annotations

from pathlib import Path

import numpy as np
import pytest
from PIL import Image

from app_logic import sanitize_basename
from face_engine import DetectedFace, FaceEngine, MatchResult
from gallery_manager import GalleryManager
from tests.helpers import FakeFaceEngine, unit_vec


class TestSanitizeRegression:
    def test_symbols_only_falls_back(self):
        assert sanitize_basename("@@@", "fb") == "fb"
        assert sanitize_basename("!!! ???", "fb") == "fb"

    def test_mixed_keeps_alnum(self):
        assert sanitize_basename("!!ok!!", "fb") == "__ok__"


class TestMatchFacesEdgeCases:
    def test_threshold_inclusive(self):
        eng = FaceEngine()
        enc = unit_vec(1, 16)
        faces = [DetectedFace((0, 10, 10, 0), enc, "Face 1")]
        # Craft a gallery vector with known cosine by using identical vector
        matches = eng.match_faces(faces, ["t.jpg"], [enc], threshold=1.0, top_n=1)
        assert len(matches) == 1
        assert matches[0].score == pytest.approx(1.0)

    def test_mismatched_name_encoding_lengths_zips_shortest(self):
        eng = FaceEngine()
        enc = unit_vec(1, 16)
        faces = [DetectedFace((0, 10, 10, 0), enc, "Face 1")]
        # Extra name ignored by zip
        matches = eng.match_faces(
            faces, ["a.jpg", "orphan.jpg"], [enc], threshold=0.0, top_n=5
        )
        assert [m.filename for m in matches] == ["a.jpg"]


class TestGalleryWebpAndJpegCase:
    def test_webp_and_jpeg_extensions(self, tmp_gallery: Path):
        Image.new("RGB", (32, 32), (200, 200, 200)).save(tmp_gallery / "x.webp", "WEBP")
        Image.new("RGB", (32, 32), (200, 200, 200)).save(tmp_gallery / "y.JPEG")
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        report = gm.load(force_recompute=True)
        assert report.loaded == 2
        assert set(gm.names) == {"x.webp", "y.JPEG"}


class TestCacheFingerprintMtime:
    def test_content_change_same_name_invalidates(self, tmp_gallery: Path):
        path = tmp_gallery / "a.jpg"
        Image.new("RGB", (32, 32), (0, 0, 0)).save(path)
        # First load: "no face" because black (FakeFaceEngine mean threshold)
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        r1 = gm.load(force_recompute=True)
        assert r1.loaded == 0
        assert r1.skipped_no_face == ["a.jpg"]

        # Brighten file (size/mtime change) so it becomes a face
        Image.new("RGB", (48, 48), (200, 200, 200)).save(path)
        r2 = gm.load(force_recompute=False)
        # No cache was written when loaded==0; must extract again
        assert r2.from_cache is False
        assert r2.loaded == 1


class TestDrawDoesNotMutateMatches:
    def test_draw_with_empty_faces(self):
        eng = FaceEngine()
        frame = np.zeros((50, 50, 3), dtype=np.uint8)
        out = eng.draw_annotations(frame, [], [MatchResult("a.jpg", 0.9, "Face 1")], 0.5)
        np.testing.assert_array_equal(out, frame)
