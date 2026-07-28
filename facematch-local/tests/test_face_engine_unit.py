"""Unit tests for FaceEngine matching, drawing, camera, and conversion logic."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import numpy as np
import pytest

from face_engine import DetectedFace, FaceEngine, MatchResult, cosine_similarity, l2_normalize
from tests.helpers import make_insight_face, unit_vec


def _det(label: str, encoding: np.ndarray, box=(10, 60, 70, 20)) -> DetectedFace:
    return DetectedFace(location=box, encoding=np.asarray(encoding), label=label)


class TestProcessScaleClamp:
    def test_clamps_low(self):
        eng = FaceEngine(process_scale=0.01)
        assert eng.process_scale == 0.25

    def test_clamps_high(self):
        eng = FaceEngine(process_scale=2.0)
        assert eng.process_scale == 1.0

    def test_keeps_mid(self):
        eng = FaceEngine(process_scale=0.5)
        assert eng.process_scale == 0.5


class TestInsightToDetected:
    def test_scales_bbox_and_normalizes(self):
        emb = np.array([3.0, 0.0, 0.0, 0.0])
        face = make_insight_face([10, 20, 30, 40], emb)
        det = FaceEngine._insight_to_detected(face, scale=0.5, index=2)
        assert det is not None
        assert det.label == "Face 3"
        # scale 0.5 → invert *2
        top, right, bottom, left = det.location
        assert (left, top, right, bottom) == (20, 40, 60, 80)
        assert abs(np.linalg.norm(det.encoding) - 1.0) < 1e-9

    def test_none_embedding_skipped(self):
        face = make_insight_face([0, 0, 10, 10], None)
        assert FaceEngine._insight_to_detected(face, scale=1.0, index=0) is None


class TestMatchFaces:
    def setup_method(self):
        self.engine = FaceEngine()
        self.alice = unit_vec(1, 32)
        self.bob = unit_vec(2, 32)
        self.carol = unit_vec(3, 32)
        # Near-alice: small perturbation
        self.alice_noisy = l2_normalize(self.alice + 0.05 * unit_vec(9, 32))

    def test_empty_faces_or_gallery(self):
        faces = [_det("Face 1", self.alice)]
        assert self.engine.match_faces([], ["a.jpg"], [self.alice]) == []
        assert self.engine.match_faces(faces, [], []) == []

    def test_threshold_filters(self):
        faces = [_det("Face 1", self.alice)]
        names = ["alice.jpg", "bob.jpg"]
        encs = [self.alice, self.bob]
        # Perfect match always ~1.0
        hi = self.engine.match_faces(faces, names, encs, threshold=0.99, top_n=5)
        assert len(hi) == 1
        assert hi[0].filename == "alice.jpg"

        # Absurd threshold → nothing
        none = self.engine.match_faces(faces, names, encs, threshold=1.01, top_n=5)
        assert none == []

    def test_sorted_by_score_descending(self):
        faces = [_det("Face 1", self.alice_noisy)]
        names = ["bob.jpg", "alice.jpg", "carol.jpg"]
        encs = [self.bob, self.alice, self.carol]
        matches = self.engine.match_faces(faces, names, encs, threshold=0.0, top_n=5)
        scores = [m.score for m in matches]
        assert scores == sorted(scores, reverse=True)
        assert matches[0].filename == "alice.jpg"

    def test_top_n_per_face(self):
        faces = [_det("Face 1", self.alice)]
        names = [f"g{i}.jpg" for i in range(10)]
        encs = [l2_normalize(self.alice + 0.01 * i * unit_vec(100 + i, 32)) for i in range(10)]
        matches = self.engine.match_faces(faces, names, encs, threshold=0.0, top_n=3)
        assert len(matches) == 3

    def test_multi_face_labels_preserved(self):
        faces = [_det("Face 1", self.alice), _det("Face 2", self.bob)]
        names = ["alice.jpg", "bob.jpg"]
        encs = [self.alice, self.bob]
        matches = self.engine.match_faces(faces, names, encs, threshold=0.5, top_n=1)
        by_label = {m.face_label: m.filename for m in matches}
        assert by_label["Face 1"] == "alice.jpg"
        assert by_label["Face 2"] == "bob.jpg"

    def test_global_sort_across_faces(self):
        # Face 2 has a slightly better best-score than Face 1
        faces = [
            _det("Face 1", l2_normalize(self.alice + 0.2 * unit_vec(7, 32))),
            _det("Face 2", self.bob),
        ]
        names = ["alice.jpg", "bob.jpg"]
        encs = [self.alice, self.bob]
        matches = self.engine.match_faces(faces, names, encs, threshold=0.0, top_n=1)
        assert matches[0].face_label == "Face 2"
        assert matches[0].filename == "bob.jpg"

    def test_top_n_zero_still_returns_at_least_one(self):
        faces = [_det("Face 1", self.alice)]
        matches = self.engine.match_faces(
            faces, ["a.jpg"], [self.alice], threshold=0.0, top_n=0
        )
        assert len(matches) == 1

    def test_score_is_cosine(self):
        faces = [_det("Face 1", self.alice_noisy)]
        matches = self.engine.match_faces(
            faces, ["a.jpg"], [self.alice], threshold=0.0, top_n=1
        )
        expected = cosine_similarity(self.alice_noisy, self.alice)
        assert matches[0].score == pytest.approx(expected, abs=1e-9)


class TestDrawAnnotations:
    def test_returns_copy_same_shape(self):
        eng = FaceEngine()
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        faces = [_det("Face 1", unit_vec(1), box=(20, 80, 90, 30))]
        matches = [MatchResult("alice.jpg", 0.9, "Face 1")]
        out = eng.draw_annotations(frame, faces, matches, threshold=0.4)
        assert out.shape == frame.shape
        assert out is not frame
        # Drawing should change some pixels
        assert not np.array_equal(out, frame)

    def test_no_match_label_when_below_threshold(self):
        eng = FaceEngine()
        frame = np.zeros((120, 160, 3), dtype=np.uint8)
        faces = [_det("Face 1", unit_vec(1), box=(30, 90, 100, 40))]
        matches = [MatchResult("alice.jpg", 0.2, "Face 1")]
        out = eng.draw_annotations(frame, faces, matches, threshold=0.8)
        # OpenCV putText is hard to OCR; ensure function completes and paints box.
        assert out.sum() > 0

    def test_multiple_faces_no_crash(self):
        eng = FaceEngine()
        frame = np.zeros((200, 300, 3), dtype=np.uint8)
        faces = [
            _det("Face 1", unit_vec(1), box=(10, 50, 60, 10)),
            _det("Face 2", unit_vec(2), box=(10, 150, 60, 100)),
            _det("Face 3", unit_vec(3), box=(5, 40, 40, 5)),  # near top edge
        ]
        matches = [
            MatchResult("a.jpg", 0.95, "Face 1"),
            MatchResult("b.jpg", 0.91, "Face 2"),
        ]
        out = eng.draw_annotations(frame, faces, matches, threshold=0.5)
        assert out.shape == frame.shape

    def test_best_match_per_face_wins(self):
        eng = FaceEngine()
        frame = np.ones((100, 100, 3), dtype=np.uint8) * 10
        faces = [_det("Face 1", unit_vec(1), box=(20, 70, 80, 20))]
        matches = [
            MatchResult("weak.jpg", 0.5, "Face 1"),
            MatchResult("strong.jpg", 0.95, "Face 1"),
        ]
        # Smoke: chooses strong for overlay path without error
        out = eng.draw_annotations(frame, faces, matches, threshold=0.4)
        assert out is not None


class TestDetectFacesCaching:
    def test_reuse_last_returns_copy_of_cache(self):
        eng = FaceEngine()
        eng._last_faces = [_det("Face 1", unit_vec(1))]
        out = eng.detect_faces(np.zeros((10, 10, 3), dtype=np.uint8), reuse_last=True)
        assert len(out) == 1
        assert out is not eng._last_faces
        assert out[0].label == "Face 1"

    def test_empty_frame_clears_cache(self):
        eng = FaceEngine()
        eng._last_faces = [_det("Face 1", unit_vec(1))]
        eng._app = MagicMock()  # prevent model load
        out = eng.detect_faces(np.array([]), reuse_last=False)
        assert out == []
        assert eng._last_faces == []

    def test_none_frame_clears_cache(self):
        eng = FaceEngine()
        eng._last_faces = [_det("Face 1", unit_vec(1))]
        out = eng.detect_faces(None, reuse_last=False)  # type: ignore[arg-type]
        assert out == []

    def test_sorts_left_to_right_and_scales(self):
        eng = FaceEngine(process_scale=0.5)
        right = make_insight_face([80, 10, 100, 40], unit_vec(1, 8))
        left = make_insight_face([10, 10, 30, 40], unit_vec(2, 8))
        mock_app = MagicMock()
        mock_app.get.return_value = [right, left]  # deliberately unsorted
        eng._app = mock_app

        frame = np.zeros((100, 200, 3), dtype=np.uint8)
        faces = eng.detect_faces(frame, reuse_last=False)
        assert [f.label for f in faces] == ["Face 1", "Face 2"]
        # Leftmost becomes Face 1; bbox scaled x2
        assert faces[0].location[3] == 20  # left
        assert faces[1].location[3] == 160

    def test_skips_faces_without_embedding(self):
        eng = FaceEngine(process_scale=1.0)
        good = make_insight_face([10, 10, 30, 40], unit_vec(1, 8))
        bad = make_insight_face([40, 10, 60, 40], None)
        eng._app = MagicMock()
        eng._app.get.return_value = [good, bad]
        faces = eng.detect_faces(np.zeros((80, 80, 3), dtype=np.uint8))
        assert len(faces) == 1


class TestExtractEncoding:
    def test_empty_returns_none(self):
        eng = FaceEngine()
        eng._app = MagicMock()
        assert eng.extract_encoding_from_image(np.array([])) is None
        assert eng.extract_encoding_from_image(None) is None  # type: ignore[arg-type]
        eng._app.get.assert_not_called()

    def test_picks_largest_face(self):
        eng = FaceEngine()
        small = make_insight_face([0, 0, 10, 10], unit_vec(1, 8))
        large = make_insight_face([0, 0, 50, 40], unit_vec(2, 8))
        eng._app = MagicMock()
        eng._app.get.return_value = [small, large]
        enc = eng.extract_encoding_from_image(np.zeros((60, 60, 3), dtype=np.uint8))
        assert enc is not None
        np.testing.assert_allclose(enc, l2_normalize(unit_vec(2, 8)), atol=1e-6)

    def test_rgb_flag_converts(self):
        eng = FaceEngine()
        eng._app = MagicMock()
        eng._app.get.return_value = []
        rgb = np.zeros((40, 40, 3), dtype=np.uint8)
        rgb[:] = (255, 0, 0)  # red in RGB
        eng.extract_encoding_from_image(rgb, is_rgb=True)
        called_img = eng._app.get.call_args[0][0]
        # BGR red channel is index 2
        assert called_img[0, 0, 2] == 255
        assert called_img[0, 0, 0] == 0


class TestCamera:
    def test_read_frame_when_closed(self):
        eng = FaceEngine()
        assert eng.read_frame() is None
        assert eng.is_open is False

    def test_open_camera_failure(self):
        eng = FaceEngine(camera_index=99)
        with patch("face_engine.cv2.VideoCapture") as VC:
            cap = MagicMock()
            cap.isOpened.return_value = False
            VC.return_value = cap
            with pytest.raises(RuntimeError, match="Could not open camera"):
                eng.open_camera()

    def test_open_close_and_read(self):
        eng = FaceEngine()
        with patch("face_engine.cv2.VideoCapture") as VC:
            cap = MagicMock()
            cap.isOpened.return_value = True
            frame = np.zeros((480, 640, 3), dtype=np.uint8)
            cap.read.return_value = (True, frame)
            VC.return_value = cap

            eng.open_camera()
            assert eng.is_open
            got = eng.read_frame()
            assert got is not None
            assert got.shape == (480, 640, 3)

            cap.read.return_value = (False, None)
            assert eng.read_frame() is None

            eng.close_camera()
            assert eng._cap is None
            cap.release.assert_called()

    def test_load_models_idempotent(self):
        eng = FaceEngine()
        sentinel = MagicMock()
        eng._app = sentinel
        eng.load_models()
        assert eng._app is sentinel
        assert eng.models_ready is True
