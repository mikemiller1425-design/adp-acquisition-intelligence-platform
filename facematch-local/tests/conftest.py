"""
Shared fixtures for FaceMatch Local tests.
"""

from __future__ import annotations

from pathlib import Path

import pytest


@pytest.fixture
def tmp_gallery(tmp_path: Path) -> Path:
    g = tmp_path / "gallery"
    g.mkdir()
    return g


@pytest.fixture(scope="session")
def real_engine():
    """Session-scoped InsightFace engine (downloads models once)."""
    from face_engine import FaceEngine

    engine = FaceEngine(process_scale=1.0, model_name="buffalo_sc", det_size=(320, 320))
    engine.load_models()
    return engine


@pytest.fixture(scope="session")
def sample_bgr():
    """InsightFace bundled sample image (multi-face), or None if unavailable."""
    try:
        from insightface.data import get_image

        return get_image("t1")
    except Exception:
        return None
