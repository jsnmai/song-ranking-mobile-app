# Business logic for authentication.
# All decisions about what constitutes a valid registration or login live here.
# The router calls these functions; this layer calls the crud layer for data access.
import secrets
from datetime import date, datetime, timedelta, timezone

from fastapi import BackgroundTasks, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from src.core.config import settings
from src.core.security import (
    create_access_token,
    dummy_verify,
    email_throttle_hash,
    hash_password,
    verify_password,
)
from src.crud.account_deletion import (
    delete_password_reset_tokens_for_user,
    delete_profile_for_user,
    delete_similarity_snapshots_for_user,
    delete_social_rows_for_user,
    delete_taste_history_for_user,
    list_ranked_song_ids_for_user,
)
from src.crud.login_attempt import (
    clear_failed_logins,
    count_failed_logins_since,
    delete_failed_logins_before,
    record_failed_login,
)
from src.crud.password_reset import (
    create_token,
    delete_expired,
    get_active_token_for_user,
    increment_attempts,
    invalidate_user_tokens,
    mark_consumed,
)
from src.crud.password_reset_request import (
    count_requests_since,
    delete_requests_before,
    most_recent_request,
    record_request,
)
from src.crud.profile import get_by_username
from src.crud.song import recompute_song_aggregates
from src.crud.user import create_user_with_profile, get_by_email, set_password
from src.pydantic_schemas.auth import GenericMessage
from src.pydantic_schemas.user import RegisterResponse, Token, UserRegister, UserResponse
from src.services.email import send_no_account_notice, send_password_changed_notice, send_password_reset_code
from src.services.pwned_passwords import is_password_pwned
from src.sqlalchemy_tables.user import User

AGE_GATE_VERSION = "2026-06-13-plus-v1"
MINIMUM_AGE = 13

# Identical on every path of request_password_reset so the response never leaks
# whether an account exists for the given email.
GENERIC_RESET_MESSAGE = "If an account exists for that email, a reset code has been sent."
# Shared by every confirm-failure path (unknown email / no token / expired /
# wrong code / over attempt cap) so none of them is distinguishable.
INVALID_CODE_MESSAGE = "Invalid or expired code."
BREACHED_PASSWORD_MESSAGE = "This password has appeared in a known data breach. Please choose a different password."


def _reject_if_breached(password: str) -> None:
    """
    Reject a password found in a known data breach (HIBP screening).

    Called wherever a password is set (register, reset). Fail-open: if the HIBP
    check can't run, is_password_pwned returns False, so an outage never blocks a
    signup or a reset.
    """
    if is_password_pwned(password):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=BREACHED_PASSWORD_MESSAGE,
        )


def register_user(
    db: Session,
    data: UserRegister,
) -> RegisterResponse:
    """
    Register a new user account with profile in a single atomic transaction.

    1. Email already exists? → 409
    2. Username already taken? → 409
    3. Hash the password — plain-text never touches the DB
    4. Create user + profile atomically — if either insert fails, both roll back
    5. Issue a JWT and return it alongside the user — client needs no separate login call

    The IntegrityError catch handles the race window between steps 2 and 4.
    The psycopg2 error string contains the column name, so the right 409 message
    is returned (username vs email) even when two requests slip through simultaneously.
    """
    if not _is_at_least_13(data.birthdate):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="LISTn is only available for users 13 and older.",
        )

    if get_by_email(db, data.email):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    if get_by_username(db, data.username):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Username already taken.",
        )

    _reject_if_breached(data.password)

    hashed = hash_password(data.password)
    try:
        user = create_user_with_profile(
            db,
            email=data.email,
            hashed_password=hashed,
            username=data.username,  # already lowercased by the Pydantic validator
            display_name=data.display_name,
            age_verified_13_plus=True,
            age_verified_at=datetime.now(timezone.utc),
            age_gate_version=AGE_GATE_VERSION,
        )
        db.commit()
        db.refresh(user)
    except IntegrityError as err:
        db.rollback()
        # Inspect the underlying psycopg2 error to distinguish which unique constraint fired.
        # The error string contains the column name, e.g. "Key (username)=(...) already exists."
        if "username" in str(err.orig):
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="Username already taken.",
            )
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with this email already exists.",
        )
    except Exception:
        db.rollback()
        raise

    token = create_access_token({"sub": str(user.id)})
    return RegisterResponse(
        access_token=token,
        user=UserResponse.model_validate(user),
    )


def _is_at_least_13(
    birthdate: date,
) -> bool:
    """Return whether the birthdate is at least 13 years old today."""
    today = date.today()
    age = today.year - birthdate.year
    if (today.month, today.day) < (birthdate.month, birthdate.day):
        age -= 1
    return age >= MINIMUM_AGE


def login_user(
    db: Session,
    email: str,
    password: str,
) -> Token:
    """
    Authenticate a user and return a JWT access token.

    1. Per-email failure throttle (BEFORE user lookup, known and unknown emails alike):
       too many recent failures → 429. Per-IP limits alone are evadable by rotating
       source addresses; this bounds guessing per ACCOUNT.
    2. User with this email exists? → 401 if not (with a decoy bcrypt verify so the
       unknown-email path costs the same as a wrong password)
    3. Password matches the stored hash? → 401 if not, recording the failure
    4. Success clears the email's failure history and issues a JWT

    Both credential failures return the same 401 — prevents email enumeration.
    """
    now = datetime.now(timezone.utc)
    email_hash = email_throttle_hash(email)
    window_start = now - timedelta(minutes=settings.login_failure_window_minutes)

    # Opportunistic cleanup so the throttle log never grows unbounded.
    delete_failed_logins_before(db, window_start)
    if count_failed_logins_since(db, email_hash, window_start) >= settings.login_max_failures_per_window:
        db.commit()  # persist the opportunistic cleanup
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many login attempts. Try again later.",
        )

    user = get_by_email(
        db,
        email,
    )
    if not user:
        # Decoy verify: the unknown-email path must cost a real bcrypt comparison,
        # or response timing becomes an email-enumeration oracle.
        dummy_verify()
    if not user or not verify_password(
        password,
        user.hashed_password,
    ):
        record_failed_login(db, email_hash)
        db.commit()
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid credentials.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    clear_failed_logins(db, email_hash)
    db.commit()
    token = create_access_token({"sub": str(user.id)})
    return Token(access_token=token)


def request_password_reset(
    db: Session,
    email: str,
    background_tasks: BackgroundTasks,
) -> GenericMessage:
    """
    Start a password reset: email a one-time code if the account exists.

    Returns a byte-identical GenericMessage on every path so the response never
    reveals whether the email is registered. A per-email throttle (cooldown +
    hourly cap) runs BEFORE the user lookup and records a row for known and
    unknown emails alike, so flooding any specific inbox is bounded regardless
    of whether an account exists. The email send is backgrounded so the response
    returns at constant time.
    """
    now = datetime.now(timezone.utc)
    email_hash = email_throttle_hash(email)
    window = timedelta(minutes=settings.reset_request_window_minutes)
    cooldown = timedelta(seconds=settings.reset_resend_cooldown_seconds)

    try:
        # Opportunistic cleanup of throttle rows that have aged out of the window,
        # and of reset tokens that have already expired, so neither table grows unbounded.
        delete_requests_before(db, now - window)
        delete_expired(db, now)

        # Per-email throttle — runs for known AND unknown emails.
        recent = most_recent_request(db, email_hash)
        within_cooldown = recent is not None and (now - recent.created_at) < cooldown
        at_cap = (
            count_requests_since(db, email_hash, now - window)
            >= settings.reset_max_requests_per_window
        )
        if within_cooldown or at_cap:
            db.commit()  # persist the opportunistic cleanup
            return GenericMessage(message=GENERIC_RESET_MESSAGE)

        record_request(db, email_hash)

        user = get_by_email(db, email)
        # Generate + bcrypt-hash the code on BOTH the known and unknown paths. The
        # bcrypt hash (~250ms) dominates request time, so hashing only when the
        # account exists would make the response measurably slower for registered
        # emails — a reliable enumeration oracle that defeats the identical
        # GENERIC_RESET_MESSAGE. On the unknown path the hash is simply discarded.
        code = f"{secrets.randbelow(1_000_000):06d}"  # cryptographically secure 6-digit code
        hashed_code = hash_password(code)
        if user is not None:
            invalidate_user_tokens(db, user.id, consumed_at=now)
            create_token(
                db,
                user_id=user.id,
                hashed_code=hashed_code,
                expires_at=now + timedelta(minutes=settings.reset_code_ttl_minutes),
            )
            background_tasks.add_task(send_password_reset_code, user.email, code)
        else:
            # No account for this address: send a gentle courtesy note to the
            # entered address so a mistyped or unregistered email gets a clarifying
            # nudge instead of silence. It goes only to that address (never the
            # requester) and rides the throttle above, so it adds no enumeration
            # vector and cannot spam an inbox.
            background_tasks.add_task(send_no_account_notice, email)

        db.commit()
    except Exception:
        db.rollback()
        raise

    return GenericMessage(message=GENERIC_RESET_MESSAGE)


def confirm_password_reset(
    db: Session,
    email: str,
    code: str,
    new_password: str,
    background_tasks: BackgroundTasks,
) -> None:
    """
    Complete a password reset: verify the code and set the new password.

    Every failure path (unknown email, no active token, expired, wrong code,
    over the attempt cap) raises the same generic 400 so none is distinguishable.
    On success the password is changed, password_changed_at is stamped (which
    invalidates JWTs on all other devices), the token and its siblings are
    consumed, and a security notice is emailed. No token is issued — the client
    returns to the Login screen.
    """
    now = datetime.now(timezone.utc)
    invalid = HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail=INVALID_CODE_MESSAGE,
    )

    user = get_by_email(db, email)
    token = get_active_token_for_user(db, user.id, now) if user is not None else None
    if token is None or token.attempts >= settings.reset_code_max_attempts:
        # Spend the same bcrypt time the wrong-code branch below pays, so an
        # unknown email / absent token can't be distinguished by response timing.
        dummy_verify()
        raise invalid

    if not verify_password(code, token.hashed_code):
        try:
            increment_attempts(db, token)
            # The final wrong attempt burns the token, so brute force can't
            # resume against the same low-entropy code.
            if token.attempts >= settings.reset_code_max_attempts:
                mark_consumed(db, token, consumed_at=now)
            db.commit()
        except Exception:
            db.rollback()
            raise
        raise invalid

    # Code is valid: block a breached new password. The token is NOT consumed
    # here, so the user can retry with the same code and a stronger password.
    _reject_if_breached(new_password)

    try:
        set_password(db, user, hash_password(new_password), changed_at=now)
        mark_consumed(db, token, consumed_at=now)
        invalidate_user_tokens(db, user.id, consumed_at=now)  # kill any siblings
        db.commit()
    except Exception:
        db.rollback()
        raise

    background_tasks.add_task(send_password_changed_notice, user.email)


def delete_current_user(
    db: Session,
    current_user: User,
) -> None:
    """
    Delete the authenticated user's account and row-level taste history.

    MVP deletion intentionally removes identifiable ratings and comparisons
    instead of anonymizing row-level taste. Song metadata stays because songs
    are catalog data, and aggregate scores are recomputed from remaining users.
    """
    user_id = current_user.id
    affected_song_ids = list_ranked_song_ids_for_user(
        db,
        user_id,
    )

    try:
        delete_similarity_snapshots_for_user(
            db,
            user_id,
        )
        delete_taste_history_for_user(
            db,
            user_id,
        )
        delete_social_rows_for_user(
            db,
            user_id,
        )
        delete_profile_for_user(
            db,
            user_id,
        )
        delete_password_reset_tokens_for_user(
            db,
            user_id,
        )

        for song_id in sorted(affected_song_ids):
            recompute_song_aggregates(
                db,
                song_id,
            )

        db.delete(current_user)
        db.commit()
    except Exception:
        db.rollback()
        raise
