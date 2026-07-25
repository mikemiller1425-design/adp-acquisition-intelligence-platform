"""
Pure helpers shared by the GUI — kept free of tkinter/CustomTkinter so they
can be unit-tested in headless environments.
"""

from __future__ import annotations

from typing import List, Optional, Sequence

from face_engine import DetectedFace, MatchResult


def format_match_list_text(
    faces: Sequence[DetectedFace],
    matches: Sequence[MatchResult],
    *,
    gallery_empty: bool,
    threshold: float,
) -> str:
    """Build the side-panel text for live match results."""
    lines: List[str] = []
    if not faces:
        lines.append("No face detected in frame.")
    elif gallery_empty:
        lines.append("Gallery empty — nothing to match against.")
    elif not matches:
        lines.append(
            f"{len(faces)} face(s) detected; no gallery hits ≥ {float(threshold):.2f}."
        )
    else:
        lines.append(f"{'Score':>6}  {'Live face':<10}  Gallery file")
        lines.append("-" * 48)
        for m in matches:
            lines.append(f"{m.score:6.3f}  {m.face_label:<10}  {m.filename}")
    return "\n".join(lines)


def largest_face(faces: Sequence[DetectedFace]) -> Optional[DetectedFace]:
    """Return the face with the largest bounding-box area, or None."""
    if not faces:
        return None

    def area(f: DetectedFace) -> int:
        top, right, bottom, left = f.location
        return max(0, bottom - top) * max(0, right - left)

    return max(faces, key=area)


def sanitize_basename(basename: Optional[str], fallback: str) -> str:
    """
    Turn a user/ basenamelike string into a filesystem-safe stem.

    Empty / whitespace-only / symbol-only inputs fall back to ``fallback``.
    """
    if not basename:
        return fallback
    stem = basename.strip()
    safe = "".join(c if c.isalnum() or c in "-_" else "_" for c in stem)
    # All-symbol input becomes "___" — treat as empty and use the fallback.
    if not safe or not any(c.isalnum() for c in safe):
        return fallback
    return safe


def should_reuse_detections(frame_count: int, every_n: int) -> bool:
    """
    Whether the video loop should reuse the previous detection result.

    Frame 1 always runs detection; with every_n=2, frames 2,4,6,… reuse
    while frames 1,3,5,… re-detect.
    """
    if every_n <= 1 or frame_count <= 0:
        return False
    # Detect when (frame_count - 1) is divisible by every_n.
    return ((frame_count - 1) % every_n) != 0


def preview_scale(width: int, height: int, max_w: int, max_h: int) -> float:
    """Scale factor to fit a frame into a preview box without upscaling."""
    if width <= 0 or height <= 0:
        return 1.0
    return min(max_w / width, max_h / height, 1.0)
