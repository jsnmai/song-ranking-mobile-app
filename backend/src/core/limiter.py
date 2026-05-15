# Shared rate limiter instance used by slowapi to enforce per-route request limits.
# Applied to auth and (in later phases) search endpoints to prevent brute-force
# attacks and abuse of the Deezer proxy.
from slowapi import Limiter
from slowapi.util import get_remote_address

# key_func=get_remote_address tracks limits per client IP so one user cannot
# exhaust the budget for everyone. This is the standard choice for public APIs
# where clients are not authenticated at the point of rate-limiting (login/register).
limiter = Limiter(key_func=get_remote_address)
