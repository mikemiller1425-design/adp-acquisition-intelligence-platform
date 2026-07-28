"""Instagram URL parsing and validation helpers."""

from __future__ import annotations

import re
from urllib.parse import urlparse

# Accept common Instagram link shapes:
#   https://www.instagram.com/p/SHORTCODE/
#   https://www.instagram.com/reel/SHORTCODE/
#   https://www.instagram.com/reels/SHORTCODE/
#   https://www.instagram.com/tv/SHORTCODE/
#   https://www.instagram.com/username/
#   https://www.instagram.com/stories/username/...
#   https://www.instagram.com/username/tagged/
#   https://instagr.am/p/SHORTCODE/
#   http(s)://m.instagram.com/...
# Also tolerate trailing query/fragment and accidental whitespace.
_IG_HOST = re.compile(
    r"^(?:www\.|m\.)?(?:instagram\.com|instagr\.am)$",
    re.IGNORECASE,
)

# Loose pattern used when scanning pasted multi-line text.
_URL_CANDIDATE = re.compile(
    r"https?://(?:www\.|m\.)?(?:instagram\.com|instagr\.am)/[^\s<>\"']+",
    re.IGNORECASE,
)

# Paths that are site chrome, not downloadable content / profiles.
_BLOCKED_FIRST_SEGMENTS = {
    "",
    "about",
    "accounts",
    "ads",
    "developer",
    "directory",
    "emails",
    "legal",
    "lite",
    "login",
    "privacy",
    "session",
    "signup",
    "terms",
    "web",
}


def normalize_url(raw: str) -> str:
    """Strip whitespace and trailing punctuation commonly pasted from chat."""
    url = (raw or "").strip()
    # Strip common trailing junk from messengers / markdown.
    while url and url[-1] in ".,);]>\"'":
        url = url[:-1]
    return url


def is_valid_instagram_url(raw: str) -> bool:
    """Return True if *raw* looks like a usable Instagram URL."""
    url = normalize_url(raw)
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False
    if not parsed.netloc or not _IG_HOST.match(parsed.netloc):
        return False
    # Require at least one path segment (not just the bare domain).
    path = (parsed.path or "").strip("/")
    if not path:
        return False
    first = path.split("/", 1)[0].lower()
    return first not in _BLOCKED_FIRST_SEGMENTS


def extract_instagram_urls(text: str) -> list[str]:
    """
    Extract unique valid Instagram URLs from free-form pasted text.

    Order of first appearance is preserved. Bare lines that are themselves
    URLs are preferred; embedded URLs inside longer lines are also found.
    """
    seen: set[str] = set()
    found: list[str] = []

    def _add(candidate: str) -> None:
        url = normalize_url(candidate)
        if not is_valid_instagram_url(url):
            return
        # Canonicalize lightly for de-dupe (drop fragment; keep query for share ids).
        try:
            parsed = urlparse(url)
            host = parsed.netloc.lower()
            # Normalize host aliases so duplicates collapse.
            if host.startswith("m."):
                host = host[2:]
            if host.startswith("www."):
                host = host[4:]
            if host == "instagr.am":
                host = "instagram.com"
            key = f"https://{host}{parsed.path.rstrip('/')}"
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
        if is_valid_instagram_url(line):
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
