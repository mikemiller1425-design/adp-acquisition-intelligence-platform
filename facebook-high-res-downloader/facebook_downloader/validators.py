"""Facebook URL parsing and validation helpers."""

from __future__ import annotations

import re
from urllib.parse import urlparse

# Accept common Facebook link shapes:
#   https://www.facebook.com/photo/?fbid=ID
#   https://www.facebook.com/username/photos/...
#   https://www.facebook.com/watch/?v=ID
#   https://www.facebook.com/username/videos/ID
#   https://www.facebook.com/username/posts/...
#   https://www.facebook.com/media/set/?set=...
#   https://www.facebook.com/groups/.../permalink/...
#   https://www.facebook.com/username
#   https://fb.watch/...
#   https://m.facebook.com/...
# Also tolerate trailing query/fragment and accidental whitespace.
_FB_HOST = re.compile(
    r"^(?:[\w-]+\.)?(?:facebook\.com|fb\.com|fb\.watch)$",
    re.IGNORECASE,
)

_URL_CANDIDATE = re.compile(
    r"https?://(?:[\w-]+\.)?(?:facebook\.com|fb\.com|fb\.watch)/[^\s<>\"']+",
    re.IGNORECASE,
)

# Site chrome / auth pages — not downloadable content.
_BLOCKED_FIRST_SEGMENTS = {
    "",
    "login",
    "recover",
    "checkpoint",
    "privacy",
    "policies",
    "help",
    "settings",
    "dialog",
    "sharer",
    "share",
    "r.php",
}


def normalize_url(raw: str) -> str:
    """Strip whitespace and trailing punctuation commonly pasted from chat."""
    url = (raw or "").strip()
    # Remove messenger/markdown junk, then any leftover trailing whitespace.
    while url and url[-1] in ".,);]>\"'":
        url = url[:-1]
    return url.rstrip()


def is_valid_facebook_url(raw: str) -> bool:
    """Return True if *raw* looks like a usable Facebook URL."""
    url = normalize_url(raw)
    if not url:
        return False
    try:
        parsed = urlparse(url)
    except ValueError:
        return False

    if parsed.scheme not in {"http", "https"}:
        return False
    if not parsed.netloc or not _FB_HOST.match(parsed.netloc):
        return False

    host = parsed.netloc.lower()
    # fb.watch short links are valid even with a short path.
    if host.endswith("fb.watch"):
        path = (parsed.path or "").strip("/")
        return bool(path)

    path = (parsed.path or "").strip("/")
    query = parsed.query or ""

    # photo.php?fbid=… / watch/?v=… may have empty meaningful path segments
    # but carry IDs in the query string.
    if "fbid=" in query or "v=" in query or "set=" in query or "story_fbid=" in query:
        return True

    if not path:
        return False

    first = path.split("/", 1)[0].lower()
    if first in _BLOCKED_FIRST_SEGMENTS:
        return False
    return True


def extract_facebook_urls(text: str) -> list[str]:
    """
    Extract unique valid Facebook URLs from free-form pasted text.

    Order of first appearance is preserved.
    """
    seen: set[str] = set()
    found: list[str] = []

    def _add(candidate: str) -> None:
        url = normalize_url(candidate)
        if not is_valid_facebook_url(url):
            return
        try:
            parsed = urlparse(url)
            host = parsed.netloc.lower()
            # Collapse mobile / locale subdomains for de-dupe.
            for prefix in ("m.", "www.", "web.", "l.", "lm."):
                if host.startswith(prefix):
                    host = host[len(prefix) :]
                    break
            if host.endswith("fb.com") and host != "fb.watch":
                host = "facebook.com"
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
        if is_valid_facebook_url(line):
            _add(line)
            continue
        for match in _URL_CANDIDATE.finditer(line):
            _add(match.group(0))

    if not found and text:
        for match in _URL_CANDIDATE.finditer(text):
            _add(match.group(0))

    return found
