"""Premium entitlement checks — the single seam where subscription state plugs in.

# PAYWALL: There is no payment system yet. `viewer_has_premium` is a stub that always returns False,
# so every premium-gated feature stays locked for everyone. Current premium features:
#   - Global "taste twins" compatibility (the whole-user-base view); the free default is the
#     mutual-follow circle. See `api_routers/profile.py::my_most_compatible`.
# When in-app purchases ship (App Store / Play, via RevenueCat or server-side receipt validation),
# back this with the user's real entitlement state (e.g. an `is_premium` column or a `subscriptions`
# table). This function is the ONLY place callers check premium, so flipping it on is the only change
# needed server-side.
"""
from src.sqlalchemy_tables.user import User


def viewer_has_premium(user: User) -> bool:
    # PAYWALL: stub — always False until real subscription/entitlement state exists (see module note).
    return False
