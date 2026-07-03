# Shared rate limiter instance used by slowapi to enforce per-route request limits.
# Unauthenticated routes (auth.py) key by client IP; every authenticated route keys
# by the verified JWT subject via user_or_ip_key so limits follow the ACCOUNT.
from fastapi import Request
from jose import JWTError
from slowapi import Limiter
from slowapi.util import get_remote_address

from src.core.security import decode_access_token


def user_or_ip_key(request: Request) -> str:
    """
    Key authenticated-route limits by the verified JWT subject, falling back to client IP.

    Per-IP keying is spoofable behind an appending proxy: a client can forge its own
    X-Forwarded-For entry and rotate fake addresses to reset its bucket. The JWT subject
    is not client-influenced (signature-verified with the server secret), so authed
    endpoints get per-account limits an attacker cannot escape by changing IPs. Requests
    without a valid token fall back to IP — they are about to 401 in get_current_user
    anyway, so the bucket they land in barely matters.
    """
    auth_header = request.headers.get("authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() == "bearer" and token.strip():
        try:
            subject = decode_access_token(token.strip()).get("sub")
        except JWTError:
            subject = None
        if subject:
            return f"user:{subject}"
    return get_remote_address(request)


# key_func=get_remote_address tracks limits per client IP so one user cannot
# exhaust the budget for everyone. This is the right default for routes where
# clients are not authenticated at the point of rate-limiting (login/register);
# authenticated routes override it per-route with key_func=user_or_ip_key.
limiter = Limiter(key_func=get_remote_address)
