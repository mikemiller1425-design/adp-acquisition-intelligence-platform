"""VSCO URL parsing and validation helpers."""

from __future__ import annotations

import re
from urllib.parse import urlparse

# Accept common VSCO link shapes:
#   https://vsco.co/username/media/ID
#   https://vsco.co/username
#   https://vsco.co/username/gallery/...
#   https://vsco.co/username/collection/...
#   https://vsco.co/username/space/...
#   http(s)://www.vsco.co/...
# Also tolerate trailing query/fragment and accidental whitespace.
_VSCO_HOST = re.compile(r"^(?:www\.)?vsco\.co$", re.IGNORECASE)

# Loose pattern used when scanning pasted multi-line text.
_URL_CANDIDATE = re.compile(
    r"https?://(?:www\.)?vsco\.co/[^\s<>\"']+",
    re.IGNORECASE,
)


def normalize_url(raw: str) -> str:
    """Strip whitespace and trailing punctuation commonly pasted from chat."""
    url = (raw or "").strip()
    # Strip common trailing junk from messengers / markdown.
    while url and url[-1] in ".,);]>\"'":
        url = url[:-1]
    return url


def is_valid_vsco_url(raw: str) -> bool:
    """Return True if *raw* looks like a usable VSCO URL."""
    url = normalize_url(raw)
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False
    if not parsed.netloc or not _VSCO_HOST.match(parsed.netloc):
        return False
    # Require at least a username path segment (not just the bare domain).
    path = (parsed.path or "").strip("/")
    if not path:
        return False
    # First segment must look like a username / reserved path.
    first = path.split("/", 1)[0]
    return bool(first) and first.lower() not in {"", "about", "login", "signup"}


def extract_vsco_urls(text: str) -> list[str]:
    """
    Extract unique valid VSCO URLs from free-form pasted text.

    Order of first appearance is preserved. Bare lines that are themselves
    URLs are preferred; embedded URLs inside longer lines are also found.
    """
    seen: set[str] = set()
    found: list[str] = []

    def _add(candidate: str) -> None:
        url = normalize_url(candidate)
        if not is_valid_vsco_url(url):
            return
        # Canonicalize lightly for de-dupe (drop fragment).
        try:
            parsed = urlparse(url)
            key = f"{parsed.scheme}://{parsed.netloc.lower()}{parsed.path.rstrip('/')}"
            if parsed.query:
                key += f"?{parsed.query}"
        except ValueError:
            key = url
        if key not in seen:
            seen.add(key)
            found.append(url)

    for line in (text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        # Whole-line URL first.
        if is_valid_vsco_url(line):
            _add(line)
            continue
        # Otherwise harvest embedded matches.
        for match in _URL_CANDIDATE.finditer(line):
            _add(match.group(0))

    # Also catch URLs that appear without newlines (single paste blob).
    if not found and text:
        for match in _URL_CANDIDATE.finditer(text):
            _add(match.group(0))

    return found
