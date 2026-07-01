# Screen passwords against Have I Been Pwned's Pwned Passwords range API using
# k-anonymity: only the first 5 chars of the password's SHA-1 are ever sent, so
# the full hash (and the password) never leave this server. This is defense in
# depth on top of the length policy. NIST SP 800-63B recommends screening new
# secrets against known-compromised lists.
import hashlib
import logging

import httpx

from src.core.config import settings

logger = logging.getLogger("listn.pwned")

HIBP_RANGE_URL = "https://api.pwnedpasswords.com/range/"
HIBP_TIMEOUT_SECONDS = 5.0
# HIBP asks callers to identify themselves.
USER_AGENT = "LISTN/0.1.0 password screening"


def pwned_count(password: str) -> int | None:
    """
    Return how many known breaches this password appears in, via HIBP's
    k-anonymity range API, or None if the check could not be completed.

    Only sha1(password)[:5] is sent. "Add-Padding" makes HIBP pad the response
    with random dummy entries so the number of real matches for a prefix cannot
    be inferred from the response size. A network error or non-200 returns None
    so the caller can fail open. A HIBP outage must never block setting a
    password.
    """
    sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = sha1[:5], sha1[5:]

    try:
        response = httpx.get(
            f"{HIBP_RANGE_URL}{prefix}",
            headers={
                "User-Agent": USER_AGENT,
                "Add-Padding": "true",
            },
            timeout=HIBP_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        logger.warning("Pwned-password check unavailable; failing open (allowing the password)")
        return None

    try:
        for line in response.text.splitlines():
            # Each line is "SUFFIX:COUNT"; HIBP padding lines carry a count of 0.
            line_suffix, _, count = line.partition(":")
            if line_suffix.strip().upper() == suffix:
                return int(count)
    except (AttributeError, ValueError):
        logger.warning("Pwned-password response could not be parsed; failing open")
        return None
    return 0


def is_password_pwned(password: str) -> bool:
    """
    True if the password appears in more known breaches than the configured
    threshold. Fail-open: if the check can't run (HIBP down) or is disabled via
    config, this returns False so a password is never blocked by an outage or a
    flag flip.
    """
    if not settings.pwned_password_check_enabled:
        return False
    count = pwned_count(password)
    return count is not None and count > settings.pwned_password_threshold
