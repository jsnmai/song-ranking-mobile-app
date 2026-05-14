from slowapi import Limiter
from slowapi.util import get_remote_address

# Single rate limiter instance shared across all routers.
#
# key_func=get_remote_address means the limit is tracked per IP address —
# each unique IP gets its own counter, so one user can't exhaust the limit for everyone.
#
# Applied to auth routes (register, login) to prevent brute-force attacks:
# an attacker trying to guess passwords or spam account creation gets cut off
# after hitting the per-route limit.
#
# Future phases: also apply to the Deezer search proxy (Phase 3) to avoid
# hammering the external API and to prevent scraping.
limiter = Limiter(key_func=get_remote_address)
