"""
Integration tests against real InsightFace models + sample imagery.

These are slower and require onnxruntime model files (auto-downloaded).
"""

from __future__ import annotations

import numpy as np
import pytest
from PIL import Image

from face_engine import FaceEngine, cosine_similarity
from gallery_manager import GalleryManager


pytestmark = pytest.mark.integration


def _require_sample(sample_bgr):
    if sample_bgr is None:
        pytest.skip("InsightFace sample image unavailable")


class TestRealDetection:
    def test_models_load_once(self, real_engine: FaceEngine):
        assert real_engine.models_ready
        app = real_engine._app
        real_engine.load_models()
        assert real_engine._app is app

    def test_blank_image_no_faces(self, real_engine: FaceEngine):
        blank = np.zeros((240, 320, 3), dtype=np.uint8)
        assert real_engine.detect_faces(blank) == []
        assert real_engine.extract_encoding_from_image(blank) is None

    def test_sample_detects_multiple_faces(self, real_engine: FaceEngine, sample_bgr):
        _require_sample(sample_bgr)
        faces = real_engine.detect_faces(sample_bgr)
        assert len(faces) >= 2
        # Labels are 1-indexed and left-to-right ordered
        assert faces[0].label == "Face 1"
        lefts = [f.location[3] for f in faces]
        assert lefts == sorted(lefts)
        for f in faces:
            assert f.encoding.shape[0] >= 128
            assert abs(np.linalg.norm(f.encoding) - 1.0) < 1e-3

    def test_reuse_last_does_not_call_model(self, real_engine: FaceEngine, sample_bgr):
        _require_sample(sample_bgr)
        first = real_engine.detect_faces(sample_bgr, reuse_last=False)
        # Corrupt internal app temporarily — reuse must not touch it
        real_app = real_engine._app
        real_engine._app = None
        try:
            second = real_engine.detect_faces(sample_bgr, reuse_last=True)
            assert len(second) == len(first)
            assert second[0].label == first[0].label
        finally:
            real_engine._app = real_app

    def test_process_scale_changes_box_coords_consistently(
        self, real_engine: FaceEngine, sample_bgr
    ):
        _require_sample(sample_bgr)
        eng_full = FaceEngine(process_scale=1.0, model_name="buffalo_sc", det_size=(320, 320))
        eng_full._app = real_engine._app
        eng_half = FaceEngine(process_scale=0.5, model_name="buffalo_sc", det_size=(320, 320))
        eng_half._app = real_engine._app

        full = eng_full.detect_faces(sample_bgr)
        half = eng_half.detect_faces(sample_bgr)
        assert len(full) == len(half)
        # Boxes should be in the same ballpark after scale correction
        for a, b in zip(full, half):
            for ca, cb in zip(a.location, b.location):
                assert abs(ca - cb) < 80  # loose tolerance; detector not scale-invariant


class TestRealMatchingGallery:
    def test_self_match_near_one(self, real_engine: FaceEngine, sample_bgr, tmp_path):
        _require_sample(sample_bgr)
        gallery = tmp_path / "g"
        gallery.mkdir()
        Image.fromarray(sample_bgr[:, :, ::-1]).save(gallery / "ref.jpg")

        gm = GalleryManager(gallery, real_engine)
        report = gm.load(force_recompute=True)
        assert report.loaded == 1

        faces = real_engine.detect_faces(sample_bgr)
        matches = real_engine.match_faces(
            faces, gm.names, gm.encodings, threshold=0.3, top_n=3
        )
        assert matches
        assert matches[0].filename == "ref.jpg"
        # Largest gallery face should match some live face very strongly
        assert matches[0].score > 0.7

    def test_threshold_slider_effect(self, real_engine: FaceEngine, sample_bgr, tmp_path):
        _require_sample(sample_bgr)
        gallery = tmp_path / "g"
        gallery.mkdir()
        Image.fromarray(sample_bgr[:, :, ::-1]).save(gallery / "ref.jpg")
        gm = GalleryManager(gallery, real_engine)
        gm.load(force_recompute=True)
        faces = real_engine.detect_faces(sample_bgr)

        loose = real_engine.match_faces(faces, gm.names, gm.encodings, threshold=0.2, top_n=5)
        tight = real_engine.match_faces(faces, gm.names, gm.encodings, threshold=0.999, top_n=5)
        assert len(loose) >= len(tight)

    def test_save_current_face_enrolls(self, real_engine: FaceEngine, sample_bgr, tmp_path):
        _require_sample(sample_bgr)
        gallery = tmp_path / "g"
        gallery.mkdir()
        gm = GalleryManager(gallery, real_engine)
        faces = real_engine.detect_faces(sample_bgr)
        assert faces
        name, msg = gm.save_face_image(sample_bgr, encoding=faces[0].encoding, basename="enroll")
        assert name == "enroll.jpg"
        assert not gm.is_empty

        # Immediate match against the just-enrolled embedding
        matches = real_engine.match_faces(
            faces[:1], gm.names, gm.encodings, threshold=0.9, top_n=1
        )
        assert matches and matches[0].filename == "enroll.jpg"
        assert matches[0].score == pytest.approx(1.0, abs=1e-5)

    def test_draw_annotations_on_sample(self, real_engine: FaceEngine, sample_bgr):
        _require_sample(sample_bgr)
        from face_engine import MatchResult

        faces = real_engine.detect_faces(sample_bgr)
        matches = [MatchResult("ref.jpg", 0.88, faces[0].label)]
        out = real_engine.draw_annotations(sample_bgr, faces, matches, threshold=0.4)
        assert out.shape == sample_bgr.shape
        assert not np.array_equal(out, sample_bgr)

    def test_rgb_vs_bgr_encoding_agreement(self, real_engine: FaceEngine, sample_bgr):
        _require_sample(sample_bgr)
        bgr_enc = real_engine.extract_encoding_from_image(sample_bgr, is_rgb=False)
        rgb = sample_bgr[:, :, ::-1].copy()
        rgb_enc = real_engine.extract_encoding_from_image(rgb, is_rgb=True)
        assert bgr_enc is not None and rgb_enc is not None
        assert cosine_similarity(bgr_enc, rgb_enc) > 0.99
