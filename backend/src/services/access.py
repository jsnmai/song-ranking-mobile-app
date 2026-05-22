"""Feature access gates — is_plus controls Plus-tier feature availability."""
from src.sqlalchemy_tables.user import User


def is_plus(current_user: User) -> bool:
    """
    Return True if the user has active Plus membership.

    Returns False at launch. When Plus launches, this is the only function
    that changes — all endpoints that call it will gate correctly with no
    additional code changes across the codebase.
    """
    return False
