"""SSRF protection for URL fetches."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

BLOCKED_HOSTS = frozenset(
    {
        "localhost",
        "metadata.google.internal",
        "metadata",
        "0.0.0.0",  # nosec B104
    }
)


class UnsafeURLError(ValueError):
    """Raised when a URL fails SSRF checks."""


def validate_public_http_url(url: str, *, allow_redirect_host: str | None = None) -> str:
    """Validate that a URL is http(s) and does not target private networks."""
    parsed = urlparse(url)
    if parsed.scheme not in ("http", "https"):
        raise UnsafeURLError("Only http and https URLs are allowed.")
    host = (parsed.hostname or "").lower()
    if not host:
        raise UnsafeURLError("URL host is required.")
    if host in BLOCKED_HOSTS or host.endswith(".local") or host.endswith(".internal"):
        raise UnsafeURLError("Blocked host.")
    if allow_redirect_host and host != allow_redirect_host.lower():
        # Caller revalidates each redirect hop independently; this is a helper.
        pass

    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror as exc:
        raise UnsafeURLError("Unable to resolve host.") from exc

    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_reserved
            or ip.is_multicast
            or ip.is_unspecified
        ):
            raise UnsafeURLError("URL resolves to a non-public address.")
        # Cloud metadata link-local
        if str(ip) == "169.254.169.254":
            raise UnsafeURLError("Blocked metadata endpoint.")
    return url
