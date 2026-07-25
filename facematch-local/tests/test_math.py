"""Unit tests for vector math helpers in face_engine."""

from __future__ import annotations

import numpy as np
import pytest

from face_engine import cosine_similarity, euclidean_distance, l2_normalize


class TestL2Normalize:
    def test_unit_vector_unchanged_norm(self):
        v = np.array([3.0, 4.0])
        out = l2_normalize(v)
        assert out.shape == (2,)
        assert abs(np.linalg.norm(out) - 1.0) < 1e-9
        np.testing.assert_allclose(out, np.array([0.6, 0.8]))

    def test_flattens_2d_input(self):
        v = np.array([[1.0, 0.0, 0.0]])
        out = l2_normalize(v)
        assert out.ndim == 1
        assert out.shape == (3,)

    def test_zero_vector_returned_as_is(self):
        z = np.zeros(8)
        out = l2_normalize(z)
        np.testing.assert_array_equal(out, z)

    def test_negative_components(self):
        v = np.array([-1.0, 0.0])
        out = l2_normalize(v)
        np.testing.assert_allclose(out, np.array([-1.0, 0.0]))

    def test_does_not_mutate_input(self):
        v = np.array([2.0, 0.0])
        _ = l2_normalize(v)
        np.testing.assert_array_equal(v, np.array([2.0, 0.0]))


class TestCosineSimilarity:
    def test_identical_vectors_are_one(self):
        a = np.random.default_rng(0).normal(size=64)
        assert cosine_similarity(a, a) == pytest.approx(1.0, abs=1e-9)

    def test_orthogonal_nonnegative_clamp(self):
        a = np.array([1.0, 0.0])
        b = np.array([0.0, 1.0])
        assert cosine_similarity(a, b) == pytest.approx(0.0, abs=1e-9)

    def test_opposite_vectors_clamp_to_zero(self):
        a = np.array([1.0, 0.0])
        b = np.array([-1.0, 0.0])
        # True cosine is -1; API clamps to [0, 1] for the threshold slider.
        assert cosine_similarity(a, b) == 0.0

    def test_scale_invariance(self):
        a = np.array([1.0, 2.0, 3.0])
        b = np.array([2.0, 4.0, 6.0])
        assert cosine_similarity(a, b) == pytest.approx(1.0, abs=1e-9)

    def test_partial_alignment_between_zero_and_one(self):
        a = np.array([1.0, 0.0])
        b = np.array([1.0, 1.0])
        sim = cosine_similarity(a, b)
        assert 0.0 < sim < 1.0
        assert sim == pytest.approx(np.sqrt(0.5), abs=1e-6)

    def test_zero_vector_pairs_to_zero(self):
        a = np.zeros(4)
        b = np.array([1.0, 0.0, 0.0, 0.0])
        assert cosine_similarity(a, b) == 0.0

    def test_symmetry(self):
        rng = np.random.default_rng(1)
        a, b = rng.normal(size=32), rng.normal(size=32)
        assert cosine_similarity(a, b) == pytest.approx(cosine_similarity(b, a), abs=1e-12)


class TestEuclideanDistance:
    def test_identical_is_zero(self):
        a = np.array([1.0, 2.0, 3.0])
        assert euclidean_distance(a, a) == pytest.approx(0.0, abs=1e-9)

    def test_known_distance_on_unit_sphere(self):
        a = np.array([1.0, 0.0])
        b = np.array([0.0, 1.0])
        # After L2 norm, distance between orthonormal unit vectors is sqrt(2)
        assert euclidean_distance(a, b) == pytest.approx(np.sqrt(2.0), abs=1e-9)

    def test_scale_invariance_via_normalization(self):
        a = np.array([3.0, 0.0])
        b = np.array([0.0, 5.0])
        assert euclidean_distance(a, b) == pytest.approx(np.sqrt(2.0), abs=1e-9)

    def test_monotonic_with_cosine_for_unit_vectors(self):
        """Higher cosine ⇒ smaller Euclidean distance on the unit sphere."""
        a = np.array([1.0, 0.0, 0.0])
        close = l2_normalize(np.array([1.0, 0.1, 0.0]))
        far = l2_normalize(np.array([0.1, 1.0, 0.0]))
        assert cosine_similarity(a, close) > cosine_similarity(a, far)
        assert euclidean_distance(a, close) < euclidean_distance(a, far)
