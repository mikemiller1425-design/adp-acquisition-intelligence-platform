"""Deep tests for GalleryManager load/cache/save behavior."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import patch

import numpy as np
import pytest
from PIL import Image

from gallery_manager import CACHE_FILENAME, GalleryManager
from tests.helpers import FakeFaceEngine, unit_vec


def _write_rgb(path: Path, color=(200, 100, 50), size=(64, 64)) -> None:
    Image.new("RGB", size, color).save(path)


class TestListAndEnsure:
    def test_ensure_dir_creates(self, tmp_path: Path):
        target = tmp_path / "nested" / "gallery"
        gm = GalleryManager(target, FakeFaceEngine())
        gm.ensure_dir()
        assert target.is_dir()

    def test_list_filters_extensions_and_sorts(self, tmp_gallery: Path):
        _write_rgb(tmp_gallery / "b.PNG")
        _write_rgb(tmp_gallery / "a.jpg")
        (tmp_gallery / "notes.txt").write_text("x")
        (tmp_gallery / "noext").write_text("x")
        (tmp_gallery / "nested").mkdir()
        _write_rgb(tmp_gallery / "nested" / "skip.jpg")  # non-recursive
        gm = GalleryManager(tmp_gallery, FakeFaceEngine())
        names = [p.name for p in gm.list_image_files()]
        assert names == ["a.jpg", "b.PNG"]

    def test_list_missing_dir(self, tmp_path: Path):
        gm = GalleryManager(tmp_path / "missing", FakeFaceEngine())
        assert gm.list_image_files() == []


class TestLoadEmptyAndSkips:
    def test_empty_gallery_message(self, tmp_gallery: Path):
        gm = GalleryManager(tmp_gallery, FakeFaceEngine())
        report = gm.load(force_recompute=True)
        assert report.loaded == 0
        assert gm.is_empty
        assert "empty" in report.message.lower()
        assert not (tmp_gallery / CACHE_FILENAME).exists()

    def test_skips_no_face_images(self, tmp_gallery: Path):
        # mean ~0 → FakeFaceEngine returns None
        Image.new("RGB", (32, 32), (0, 0, 0)).save(tmp_gallery / "blank.jpg")
        # bright → has face
        _write_rgb(tmp_gallery / "person.jpg", (220, 180, 160))
        engine = FakeFaceEngine(default_encoding=unit_vec(5, 16))
        gm = GalleryManager(tmp_gallery, engine)
        report = gm.load(force_recompute=True)
        assert report.loaded == 1
        assert report.skipped_no_face == ["blank.jpg"]
        assert gm.names == ["person.jpg"]

    def test_skips_unreadable_files(self, tmp_gallery: Path):
        bad = tmp_gallery / "corrupt.jpg"
        bad.write_bytes(b"not-an-image")
        _write_rgb(tmp_gallery / "ok.png", (180, 180, 180))
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        report = gm.load(force_recompute=True)
        assert report.loaded == 1
        assert any("corrupt.jpg" in e for e in report.skipped_error)


class TestCacheBehavior:
    def test_second_load_uses_cache(self, tmp_gallery: Path):
        _write_rgb(tmp_gallery / "a.jpg")
        engine = FakeFaceEngine(default_encoding=unit_vec(11, 16))
        gm = GalleryManager(tmp_gallery, engine)
        r1 = gm.load(force_recompute=True)
        assert r1.from_cache is False
        assert engine.extract_calls == 1

        engine2 = FakeFaceEngine(default_encoding=unit_vec(99, 16))
        gm2 = GalleryManager(tmp_gallery, engine2)
        r2 = gm2.load(force_recompute=False)
        assert r2.from_cache is True
        assert r2.loaded == 1
        assert engine2.extract_calls == 0
        np.testing.assert_allclose(gm2.encodings[0], unit_vec(11, 16))

    def test_force_recompute_bypasses_cache(self, tmp_gallery: Path):
        _write_rgb(tmp_gallery / "a.jpg")
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        gm.load(force_recompute=True)

        engine = FakeFaceEngine(default_encoding=unit_vec(2, 8))
        gm2 = GalleryManager(tmp_gallery, engine)
        r = gm2.load(force_recompute=True)
        assert r.from_cache is False
        assert engine.extract_calls == 1
        np.testing.assert_allclose(gm2.encodings[0], unit_vec(2, 8))

    def test_cache_invalidated_when_file_added(self, tmp_gallery: Path):
        _write_rgb(tmp_gallery / "a.jpg")
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        gm.load(force_recompute=True)

        _write_rgb(tmp_gallery / "b.jpg", (100, 150, 200))
        engine = FakeFaceEngine(default_encoding=unit_vec(3, 8))
        gm2 = GalleryManager(tmp_gallery, engine)
        r = gm2.load(force_recompute=False)
        assert r.from_cache is False
        assert r.loaded == 2
        assert engine.extract_calls == 2

    def test_cache_invalidated_when_file_removed(self, tmp_gallery: Path):
        _write_rgb(tmp_gallery / "a.jpg")
        _write_rgb(tmp_gallery / "b.jpg")
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        gm.load(force_recompute=True)
        (tmp_gallery / "b.jpg").unlink()

        engine = FakeFaceEngine(default_encoding=unit_vec(4, 8))
        gm2 = GalleryManager(tmp_gallery, engine)
        r = gm2.load(force_recompute=False)
        assert r.from_cache is False
        assert r.loaded == 1

    def test_corrupt_cache_falls_back_to_extract(self, tmp_gallery: Path):
        _write_rgb(tmp_gallery / "a.jpg")
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        gm.load(force_recompute=True)
        (tmp_gallery / CACHE_FILENAME).write_bytes(b"garbage")

        engine = FakeFaceEngine(default_encoding=unit_vec(5, 8))
        gm2 = GalleryManager(tmp_gallery, engine)
        r = gm2.load(force_recompute=False)
        assert r.from_cache is False
        assert r.loaded == 1

    def test_mismatched_cache_lengths_rejected(self, tmp_gallery: Path):
        _write_rgb(tmp_gallery / "a.jpg")
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        paths = gm.list_image_files()
        fp = gm._file_fingerprint(paths)
        # names length 2, encodings length 1
        np.savez_compressed(
            tmp_gallery / CACHE_FILENAME,
            fingerprint=np.asarray(fp),
            names=np.asarray(["a.jpg", "ghost.jpg"], dtype=object),
            encodings=np.zeros((1, 8), dtype=np.float64),
        )
        engine = FakeFaceEngine(default_encoding=unit_vec(6, 8))
        gm2 = GalleryManager(tmp_gallery, engine)
        r = gm2.load(force_recompute=False)
        assert r.from_cache is False
        assert engine.extract_calls == 1

    def test_fingerprint_stable_for_unchanged_files(self, tmp_gallery: Path):
        _write_rgb(tmp_gallery / "a.jpg")
        gm = GalleryManager(tmp_gallery, FakeFaceEngine())
        paths = gm.list_image_files()
        assert gm._file_fingerprint(paths) == gm._file_fingerprint(paths)


class TestSaveFaceImage:
    def test_no_frame(self, tmp_gallery: Path):
        gm = GalleryManager(tmp_gallery, FakeFaceEngine())
        name, msg = gm.save_face_image(None)  # type: ignore[arg-type]
        assert name is None
        assert "No frame" in msg

    def test_empty_frame(self, tmp_gallery: Path):
        gm = GalleryManager(tmp_gallery, FakeFaceEngine())
        name, msg = gm.save_face_image(np.array([]))
        assert name is None
        assert "No frame" in msg

    def test_no_face_in_frame(self, tmp_gallery: Path):
        gm = GalleryManager(tmp_gallery, FakeFaceEngine())
        frame = np.zeros((48, 48, 3), dtype=np.uint8)
        name, msg = gm.save_face_image(frame)
        assert name is None
        assert "No face" in msg

    def test_saves_with_provided_encoding(self, tmp_gallery: Path):
        engine = FakeFaceEngine()  # would reject blank, but encoding provided
        gm = GalleryManager(tmp_gallery, engine)
        frame = np.zeros((48, 48, 3), dtype=np.uint8)
        enc = unit_vec(7, 16)
        name, msg = gm.save_face_image(frame, encoding=enc, basename="me")
        assert name == "me.jpg"
        assert (tmp_gallery / "me.jpg").is_file()
        assert gm.names == ["me.jpg"]
        np.testing.assert_allclose(gm.encodings[0], enc)
        assert (tmp_gallery / CACHE_FILENAME).is_file()
        assert "Saved me.jpg" in msg

    def test_collision_suffix(self, tmp_gallery: Path):
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        frame = np.ones((40, 40, 3), dtype=np.uint8) * 200
        n1, _ = gm.save_face_image(frame, basename="dup")
        n2, _ = gm.save_face_image(frame, basename="dup")
        assert n1 == "dup.jpg"
        assert n2 == "dup_1.jpg"
        assert set(gm.names) == {"dup.jpg", "dup_1.jpg"}

    def test_sanitizes_basename(self, tmp_gallery: Path):
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        frame = np.ones((40, 40, 3), dtype=np.uint8) * 180
        name, _ = gm.save_face_image(frame, basename="Ann O'Malley!")
        assert name == "Ann_O_Malley_.jpg"

    def test_save_then_load_from_cache(self, tmp_gallery: Path):
        enc = unit_vec(12, 16)
        gm = GalleryManager(tmp_gallery, FakeFaceEngine())
        frame = np.ones((40, 40, 3), dtype=np.uint8) * 210
        gm.save_face_image(frame, encoding=enc, basename="cached")

        gm2 = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(0, 16)))
        r = gm2.load(force_recompute=False)
        assert r.from_cache is True
        np.testing.assert_allclose(gm2.encodings[0], enc)

    def test_sync_drops_stale_entries_on_save(self, tmp_gallery: Path):
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        frame = np.ones((40, 40, 3), dtype=np.uint8) * 200
        gm.save_face_image(frame, basename="keep")
        # Manually inject a stale entry pointing at a deleted file
        from gallery_manager import GalleryEntry

        gm.entries.append(
            GalleryEntry(filename="gone.jpg", encoding=unit_vec(2, 8), path=str(tmp_gallery / "gone.jpg"))
        )
        gm.save_face_image(frame, basename="keep2")
        assert "gone.jpg" not in gm.names
        assert "keep.jpg" in gm.names
        assert "keep2.jpg" in gm.names

    def test_save_failure_message(self, tmp_gallery: Path):
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        frame = np.ones((40, 40, 3), dtype=np.uint8) * 200
        with patch("gallery_manager.Image.fromarray") as fa:
            fa.return_value.save.side_effect = OSError("disk full")
            name, msg = gm.save_face_image(frame, basename="x")
        assert name is None
        assert "Failed to save" in msg


class TestProperties:
    def test_names_encodings_parallel(self, tmp_gallery: Path):
        _write_rgb(tmp_gallery / "z.jpg")
        _write_rgb(tmp_gallery / "a.jpg")
        gm = GalleryManager(tmp_gallery, FakeFaceEngine(default_encoding=unit_vec(1, 8)))
        gm.load(force_recompute=True)
        # load order follows sorted filenames
        assert gm.names == ["a.jpg", "z.jpg"]
        assert len(gm.encodings) == 2
        assert gm.is_empty is False
