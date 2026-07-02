# Business logic for the social feed.
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from src.crud.circle_aggregates import (
    CircleConsensusRow,
    circle_consensus_candidates,
    circle_disagreement_candidates,
    circle_score_distribution,
    followed_visible_song_raters,
    get_songs_by_ids,
    list_circle_contributors,
    match_moment_candidates,
    split_decision_candidates,
    viewer_rated_artist_ids,
)
from src.crud.comparison import list_compared_song_pairs
from src.crud.feed import FeedEventRow, latest_rerate_from_followed, list_feed_events
from src.crud.follow import count_following
from src.crud.interaction_event import create_interaction_event, latest_interaction_event
from src.crud.rating import RankingRow, count_user_rankings, list_user_bucket_rankings_with_songs
from src.pydantic_schemas.feed import (
    CircleRatersResponse,
    ConsensusModule,
    DisagreementModule,
    FeedEventResponse,
    FeedListResponse,
    FeedModulesResponse,
    MatchMomentModule,
    RerateRadarItem,
    SplitDecisionModule,
    SplitPerson,
    ThisOrThatChoiceRequest,
    ThisOrThatChoiceResponse,
    ThisOrThatDismissRequest,
    ThisOrThatDismissResponse,
    ThisOrThatModule,
    ThisOrThatOption,
    ThisOrThatUndoRequest,
    ThisOrThatUndoResponse,
)
from src.pydantic_schemas.profile import ProfileResponse
from src.pydantic_schemas.song import SongResponse
from src.services.circle_aggregates import CIRCLE_MIN_CONTRIBUTORS
from src.services.like import like_states_for_events
from src.services.rating import BUCKET_ORDER, apply_this_or_that_choice, undo_this_or_that_choice
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song

DEFAULT_FEED_LIMIT = 20
MAX_FEED_LIMIT = 50
# How many circle-member avatars the Recent Verdict hero asks for.
RECENT_VERDICT_RATER_LIMIT = 8

# ── Feed module base gate ────────────────────────────────────────────────────
# The bundled module area unlocks only after the viewer has rated >= 5 songs AND follows >= 3 people
# (mirrors the getting-started banner). Enforced here so older clients / direct calls can't get live
# module data before the gate is met. This gate affects ONLY /feed/modules — the rated >= 10 score
# reveal is a separate, unaffected calibration gate. Per-card data rules still apply after the gate.
MODULE_GATE_MIN_RATED = 5
MODULE_GATE_MIN_FOLLOWING = 3

# ── Consensus module (tunable) ───────────────────────────────────────────────
# Bounded candidate set the interestingness heuristic scores (ordered most-recently-active first, so
# fresh qualifying songs are never truncated out before scoring).
CONSENSUS_CANDIDATE_LIMIT = 100
# Stable-within-a-day rotation; among near-best candidates only.
CONSENSUS_ROTATE_DAYS = 1
# Only candidates within this ratio of the best score rotate, so a clearly stronger song is never hidden.
CONSENSUS_NEAR_BEST_RATIO = 0.85
# Interestingness weights: recent friend activity, your relevance, agreement (tightness), coverage.
CONSENSUS_W_RECENCY = 0.45
CONSENSUS_W_RELEVANCE = 0.20
CONSENSUS_W_AGREEMENT = 0.25
CONSENSUS_W_COVERAGE = 0.10
# Recency decays by half every N days of friend inactivity on the song.
CONSENSUS_RECENCY_HALFLIFE_DAYS = 7.0
# Small bump for a song right at the threshold (approximates "newly qualifying"; not a real snapshot).
CONSENSUS_FRESH_NUDGE = 0.10
# Std-dev at/above which agreement scores 0 (scores are 0–10).
CONSENSUS_AGREEMENT_STDDEV_SCALE = 3.0
# Friend count at which coverage scores 1.0.
CONSENSUS_COVERAGE_FULL = 8.0

# ── Disagreement Spotlight (tunable) ─────────────────────────────────────────
# A "spotlight" must be a real divergence: only surface a song whose |you − friends_avg| clears this.
DISAGREEMENT_MIN_GAP = 2.0
# Bounded set fetched after gap ordering (biggest gaps first), so a high-gap song is never truncated.
DISAGREEMENT_CANDIDATE_LIMIT = 50

# ── Split Decision (tunable) ─────────────────────────────────────────────────
# A "split" needs a real clash between two people you follow.
SPLIT_MIN_GAP = 3.0
SPLIT_CANDIDATE_LIMIT = 50

# ── Match Moment (tunable) ───────────────────────────────────────────────────
# Bounded set of recent finalized head-to-head picks (already deduped to one per actor+session in
# SQL, newest first), so the most recent valid pick is never truncated out before the service picks it.
MATCH_MOMENT_CANDIDATE_LIMIT = 50

# ── This or That (personal ranking refinement) ───────────────────────────────
# Deliberately higher than MODULE_GATE_MIN_RATED (5) and the score-reveal gate (10, see
# FeedScreen's gettingStartedComplete) so this doesn't surface in the same moment as those other
# unlocks — and so there's a real backlog of ranked songs before we ask for refinement.
THIS_OR_THAT_MIN_RATED = 15
THIS_OR_THAT_COOLDOWN = timedelta(hours=48)
THIS_OR_THAT_EVENTS = ("this_or_that_chosen", "this_or_that_dismissed")


@dataclass(frozen=True)
class ThisOrThatState:
    """
    What the Feed should show for This-or-That, and why.

    `cooldown_until`/`cooldown_reason` are set whenever `module` is None specifically because of the
    post-action cooldown (not simply "under the rated threshold" or "no candidate pairs") — the Feed
    needs this to render the right resting card (collapsed vs. cooldown-with-countdown) even after a
    fresh app load, when there's no client-side memory of which action just happened.
    """

    module: "ThisOrThatModule | None"
    cooldown_until: datetime | None = None
    cooldown_reason: str | None = None


def list_song_circle_raters(
    db: Session,
    viewer_id: int,
    song_id: int,
) -> CircleRatersResponse:
    """Circle members (mutual + visible) who currently rate the song, for the Recent Verdict hero.

    Reuses the shared circle predicate via `list_circle_contributors`, so visibility, blocks,
    only_me, deleted users, and the viewer's own exclusion all behave like every other circle
    surface. A missing song simply yields no raters (catalog ids are not sensitive).
    """
    by_song = list_circle_contributors(
        db,
        viewer_id,
        [song_id],
        per_song_limit=RECENT_VERDICT_RATER_LIMIT,
    )
    return CircleRatersResponse(
        raters=[
            ProfileResponse.model_validate(contributor.profile)
            for contributor in by_song.get(song_id, [])
        ],
    )


def get_feed_modules(
    db: Session,
    user_id: int,
) -> FeedModulesResponse:
    """Return the bundled Feed module aggregates for the viewer.

    Every module is implemented; any that has no qualifying data simply returns null (the card stays
    locked). Each aggregate rides the shared social-access predicates, so the whole module strip honors
    the same taste-visibility/block/deleted-user rules as the feed.
    """
    this_or_that_state = _this_or_that_module(db, user_id)
    if not _module_gate_met(db, user_id):
        # Base social gate not met — personal refinement can still show, but skip social module queries.
        return FeedModulesResponse(
            this_or_that=this_or_that_state.module,
            this_or_that_cooldown_until=this_or_that_state.cooldown_until,
            this_or_that_cooldown_reason=this_or_that_state.cooldown_reason,
        )
    rerate_row = latest_rerate_from_followed(db, user_id)
    return FeedModulesResponse(
        this_or_that=this_or_that_state.module,
        this_or_that_cooldown_until=this_or_that_state.cooldown_until,
        this_or_that_cooldown_reason=this_or_that_state.cooldown_reason,
        rerate_radar=_rerate_radar_item(rerate_row) if rerate_row is not None else None,
        consensus=_consensus_module(db, user_id),
        disagreement_spotlight=_disagreement_module(db, user_id),
        split_decision=_split_decision_module(db, user_id),
        match_moment=_match_moment_module(db, user_id),
    )


def _module_gate_met(
    db: Session,
    user_id: int,
) -> bool:
    """Whether the viewer has cleared the base module gate: rated >= 10 AND following >= 3.

    `count_user_rankings` is the same count behind `user_stats.rated_count`, so the backend gate
    matches the frontend's. Rated count is checked first (cheap short-circuit).
    """
    if count_user_rankings(db, user_id) < MODULE_GATE_MIN_RATED:
        return False
    return count_following(db, user_id) >= MODULE_GATE_MIN_FOLLOWING


def choose_this_or_that(
    db: Session,
    user_id: int,
    data: ThisOrThatChoiceRequest,
) -> ThisOrThatChoiceResponse:
    """Submit one inline Feed refinement choice."""
    result = apply_this_or_that_choice(
        db,
        user_id=user_id,
        left_song_id=data.left_song_id,
        right_song_id=data.right_song_id,
        winner_song_id=data.winner_song_id,
    )
    return ThisOrThatChoiceResponse(
        recorded=True,
        swapped=result.swapped,
        winner_song_id=result.winner_song_id,
        comparison_session_uuid=result.comparison_session_uuid,
    )


def undo_this_or_that(
    db: Session,
    user_id: int,
    data: ThisOrThatUndoRequest,
) -> ThisOrThatUndoResponse:
    """Undo a still-recent This-or-That choice from the Feed result popup."""
    undo_this_or_that_choice(
        db,
        user_id=user_id,
        comparison_session_uuid=data.comparison_session_uuid,
    )
    return ThisOrThatUndoResponse(undone=True)


def dismiss_this_or_that(
    db: Session,
    user_id: int,
    data: ThisOrThatDismissRequest,
) -> ThisOrThatDismissResponse:
    """Dismiss the current personal refinement prompt for the cooldown window."""
    context = _this_or_that_pair_context(
        db,
        user_id,
        data.left_song_id,
        data.right_song_id,
    )
    try:
        create_interaction_event(
            db,
            user_id=user_id,
            event_type="this_or_that_dismissed",
            source="feed",
            context=context,
        )
        db.commit()
    except Exception:
        db.rollback()
        raise
    return ThisOrThatDismissResponse(dismissed=True)


def _this_or_that_pair_context(
    db: Session,
    user_id: int,
    left_song_id: int | None,
    right_song_id: int | None,
) -> dict[str, object] | None:
    """Build explicit prompt context for a dismiss without making dismiss fragile."""
    if left_song_id is None or right_song_id is None:
        return None
    context: dict[str, object] = {
        "prompt_type": "direct_neighbor",
        "left_song_id": left_song_id,
        "right_song_id": right_song_id,
    }
    left = None
    right = None
    for bucket in BUCKET_ORDER:
        rows = list_user_bucket_rankings_with_songs(
            db,
            user_id=user_id,
            bucket=bucket,
        )
        for row in rows:
            if row.ranking.song_id == left_song_id:
                left = row.ranking
            elif row.ranking.song_id == right_song_id:
                right = row.ranking
    if left is None or right is None or left.bucket != right.bucket:
        return context
    context.update(
        {
            "bucket": left.bucket,
            "left_position": left.position,
            "right_position": right.position,
            "left_score": left.score,
            "right_score": right.score,
            "rank_distance": abs(left.position - right.position),
            "score_gap": round(abs(left.score - right.score), 4),
        }
    )
    return context


def _this_or_that_module(
    db: Session,
    user_id: int,
) -> ThisOrThatState:
    """Pick one adjacent same-bucket pair that can refine the viewer's current Rankings."""
    if count_user_rankings(db, user_id) < THIS_OR_THAT_MIN_RATED:
        return ThisOrThatState(module=None)
    latest_prompt_action = latest_interaction_event(
        db,
        user_id,
        THIS_OR_THAT_EVENTS,
    )
    if latest_prompt_action is not None:
        cooldown_until = latest_prompt_action.created_at + THIS_OR_THAT_COOLDOWN
        if datetime.now(timezone.utc) < cooldown_until:
            return ThisOrThatState(
                module=None,
                cooldown_until=cooldown_until,
                cooldown_reason=latest_prompt_action.event_type.removeprefix("this_or_that_"),
            )

    bucket_rows = {
        bucket: list_user_bucket_rankings_with_songs(
            db,
            user_id=user_id,
            bucket=bucket,
        )
        for bucket in BUCKET_ORDER
    }
    song_ids = [
        row.ranking.song_id
        for rows in bucket_rows.values()
        for row in rows
    ]
    compared_pairs = list_compared_song_pairs(
        db,
        user_id,
        song_ids,
    )
    candidates: list[tuple[datetime, int, int, RankingRow, RankingRow]] = []
    for bucket_index, bucket in enumerate(BUCKET_ORDER):
        rows = bucket_rows[bucket]
        for index in range(len(rows) - 1):
            left = rows[index]
            right = rows[index + 1]
            pair_key = frozenset((left.ranking.song_id, right.ranking.song_id))
            if pair_key in compared_pairs:
                continue
            updated_at = max(left.ranking.updated_at, right.ranking.updated_at)
            candidates.append((updated_at, bucket_index, left.ranking.position, left, right))
    if not candidates:
        return ThisOrThatState(module=None)

    _, _, _, left, right = min(candidates, key=lambda entry: (entry[0], entry[1], entry[2]))
    return ThisOrThatState(
        module=ThisOrThatModule(
            left=_this_or_that_option(left),
            right=_this_or_that_option(right),
            bucket=left.ranking.bucket,
        )
    )


def _this_or_that_option(
    row: RankingRow,
) -> ThisOrThatOption:
    """Build one side of the This-or-That prompt."""
    return ThisOrThatOption(
        ranking_id=row.ranking.id,
        song=SongResponse.model_validate(row.song),
        bucket=row.ranking.bucket,
        position=row.ranking.position,
        score=row.ranking.score,
    )


def _disagreement_module(
    db: Session,
    user_id: int,
) -> DisagreementModule | None:
    """Surface the song where the viewer's score diverges most from their friends' average.

    Gap-primary: the candidate query already filters to ≥ CIRCLE_MIN_CONTRIBUTORS friends + gap ≥
    DISAGREEMENT_MIN_GAP and orders biggest-gap-first, so the top row is the spotlight (no rotation —
    "biggest gap wins"). Friends = mutual + visible (viewer excluded from their average). Returns
    None (→ locked card) when nothing clears the gap threshold.
    """
    candidates = circle_disagreement_candidates(
        db,
        user_id,
        minimum_contributors=CIRCLE_MIN_CONTRIBUTORS,
        min_gap=DISAGREEMENT_MIN_GAP,
        limit=DISAGREEMENT_CANDIDATE_LIMIT,
    )
    if not candidates:
        return None
    chosen = candidates[0]
    songs = get_songs_by_ids(db, [chosen.song_id])
    song = songs.get(chosen.song_id)
    if song is None:
        return None
    direction = "viewer_higher" if chosen.your_score >= chosen.friends_average else "friends_higher"
    return DisagreementModule(
        song=SongResponse.model_validate(song),
        your_score=chosen.your_score,
        friends_average=chosen.friends_average,
        friends_count=chosen.friends_count,
        gap=round(chosen.gap, 1),
        direction=direction,
    )


def _split_decision_module(
    db: Session,
    user_id: int,
) -> SplitDecisionModule | None:
    """Surface a song where two people the viewer follows are far apart (biggest pairwise gap).

    Gap-primary: the candidate query already filters to ≥2 followed-visible raters + gap ≥
    SPLIT_MIN_GAP and orders biggest-gap-first, so the top row is the split (no rotation). The two
    people are the highest and lowest scorers, chosen deterministically (ties → lower user_id). The
    viewer is never a participant (the predicate excludes them). None (→ locked card) when nothing
    clears the gap.
    """
    candidates = split_decision_candidates(
        db,
        user_id,
        minimum_raters=2,
        min_gap=SPLIT_MIN_GAP,
        limit=SPLIT_CANDIDATE_LIMIT,
    )
    if not candidates:
        return None
    chosen = candidates[0]
    raters = followed_visible_song_raters(db, user_id, chosen.song_id)
    if len(raters) < 2:
        return None
    # high = highest score (ties → lower user_id); low = lowest score (ties → lower user_id).
    high = min(raters, key=lambda rater: (-rater[1], rater[2]))
    low = min(raters, key=lambda rater: (rater[1], rater[2]))
    songs = get_songs_by_ids(db, [chosen.song_id])
    song = songs.get(chosen.song_id)
    if song is None:
        return None
    return SplitDecisionModule(
        song=SongResponse.model_validate(song),
        high=SplitPerson(profile=ProfileResponse.model_validate(high[0]), score=high[1]),
        low=SplitPerson(profile=ProfileResponse.model_validate(low[0]), score=low[1]),
        gap=round(chosen.gap, 1),
    )


def _match_moment_module(
    db: Session,
    user_id: int,
) -> MatchMomentModule | None:
    """Surface the most recent finalized head-to-head pick by someone the viewer follows.

    Recency-primary: the candidate query already dedupes to the decisive last comparison per
    (actor, session) and orders newest-first, so the top row is the pick (no rotation). None
    (→ locked card) when no followed-visible person has a finalized comparison, or either song
    has since been purged from the catalog.
    """
    candidates = match_moment_candidates(
        db,
        user_id,
        limit=MATCH_MOMENT_CANDIDATE_LIMIT,
    )
    if not candidates:
        return None
    chosen = candidates[0]
    songs = get_songs_by_ids(db, [chosen.winner_song_id, chosen.loser_song_id])
    winner = songs.get(chosen.winner_song_id)
    loser = songs.get(chosen.loser_song_id)
    if winner is None or loser is None:
        return None
    return MatchMomentModule(
        actor_profile=ProfileResponse.model_validate(chosen.actor),
        winner=SongResponse.model_validate(winner),
        loser=SongResponse.model_validate(loser),
        decision_duration_ms=chosen.decision_duration_ms,
        created_at=chosen.finalized_at,
    )


def _consensus_module(
    db: Session,
    user_id: int,
) -> ConsensusModule | None:
    """Pick the most "interesting" friend-consensus song and build its avg + 10-bin distribution.

    Candidates are songs ≥ CIRCLE_MIN_CONTRIBUTORS friends (mutual + visible, viewer excluded)
    currently rate. Each is scored by recent friend activity (from rating_events), the viewer's
    relevance (rated the artist), agreement strength (tighter distributions score higher — this is
    consensus, not spread), and light coverage. The displayed pick is stabilized within a day among
    only the near-best (≥85% of the top score), so it doesn't flicker yet a clearly stronger song is
    never hidden. Returns None (→ locked card) when no song has enough friend raters.
    """
    candidates = circle_consensus_candidates(
        db,
        user_id,
        minimum_contributors=CIRCLE_MIN_CONTRIBUTORS,
        limit=CONSENSUS_CANDIDATE_LIMIT,
    )
    if not candidates:
        return None
    song_ids = [candidate.song_id for candidate in candidates]
    songs = get_songs_by_ids(db, song_ids)
    viewer_artists = viewer_rated_artist_ids(db, user_id)
    now = datetime.now(timezone.utc)

    scored: list[tuple[float, CircleConsensusRow, Song]] = []
    for candidate in candidates:
        song = songs.get(candidate.song_id)
        if song is None:
            continue
        interest = _consensus_interestingness(
            candidate,
            song,
            candidate.latest_at,
            viewer_artists,
            now,
        )
        scored.append((interest, candidate, song))
    if not scored:
        return None

    # Highest interestingness first; song_id tiebreak keeps the order deterministic.
    scored.sort(key=lambda entry: (-entry[0], entry[1].song_id))
    best = scored[0][0]
    threshold = best * CONSENSUS_NEAR_BEST_RATIO if best > 0 else float("-inf")
    near_best = [entry for entry in scored if entry[0] >= threshold]
    epoch_day = now.toordinal()
    index = (user_id + epoch_day // CONSENSUS_ROTATE_DAYS) % len(near_best)
    _, chosen, chosen_song = near_best[index]

    friend_scores = circle_score_distribution(db, user_id, chosen.song_id)
    distribution = _score_distribution_bins(friend_scores)
    return ConsensusModule(
        song=SongResponse.model_validate(chosen_song),
        average_score=chosen.average_score,
        contributor_count=chosen.contributor_count,
        distribution=distribution,
        # Real min/max friend scores anchor the spread bar's endpoints (candidate has ≥3 raters).
        low_score=min(friend_scores),
        high_score=max(friend_scores),
    )


def _consensus_interestingness(
    candidate: CircleConsensusRow,
    song: Song,
    latest_at: datetime | None,
    viewer_artists: set[int],
    now: datetime,
) -> float:
    """Weighted blend: recent friend activity + your relevance + agreement (tightness) + coverage."""
    if latest_at is not None:
        age_days = max(0.0, (now - latest_at).total_seconds() / 86400.0)
        recency = 0.5 ** (age_days / CONSENSUS_RECENCY_HALFLIFE_DAYS)
    else:
        recency = 0.0
    if candidate.contributor_count == CIRCLE_MIN_CONTRIBUTORS:
        recency = min(1.0, recency + CONSENSUS_FRESH_NUDGE)
    relevance = 1.0 if song.artist_deezer_id in viewer_artists else 0.0
    # Tighter spread ⇒ stronger agreement ⇒ higher score (consensus rewards cohesion, not spread).
    agreement = max(0.0, 1.0 - min(1.0, candidate.score_stddev / CONSENSUS_AGREEMENT_STDDEV_SCALE))
    coverage = min(1.0, candidate.contributor_count / CONSENSUS_COVERAGE_FULL)
    return (
        CONSENSUS_W_RECENCY * recency
        + CONSENSUS_W_RELEVANCE * relevance
        + CONSENSUS_W_AGREEMENT * agreement
        + CONSENSUS_W_COVERAGE * coverage
    )


def _score_distribution_bins(
    scores: list[float],
) -> list[int]:
    """Bin friend scores into exactly 10 buckets: [0,1), [1,2), … [9,10]."""
    bins = [0] * 10
    for score in scores:
        index = int(score)
        index = 0 if index < 0 else 9 if index > 9 else index
        bins[index] += 1
    return bins


def _rerate_radar_item(
    row: FeedEventRow,
) -> RerateRadarItem:
    """Build the Re-rate Radar response from a joined feed-event row."""
    return RerateRadarItem(
        rating_event_id=row.event.id,
        actor_profile=ProfileResponse.model_validate(row.actor_profile),
        song=SongResponse.model_validate(row.song),
        previous_bucket=row.event.previous_bucket,
        previous_score=row.event.previous_score,
        new_bucket=row.event.new_bucket,
        new_score=row.event.new_score,
        note=row.event.note,
        created_at=row.event.created_at,
    )


def list_my_feed(
    db: Session,
    user_id: int,
    limit: int = DEFAULT_FEED_LIMIT,
    cursor: str | None = None,
) -> FeedListResponse:
    """Return the current user's social feed using fan-out-on-read."""
    safe_limit = min(
        limit,
        MAX_FEED_LIMIT,
    )
    cursor_created_at, cursor_id = _parse_cursor(cursor)
    rows = list_feed_events(
        db,
        user_id=user_id,
        limit=safe_limit + 1,
        cursor_created_at=cursor_created_at,
        cursor_id=cursor_id,
    )
    has_next_page = len(rows) > safe_limit
    page_rows = rows[:safe_limit]
    next_cursor = _build_cursor(page_rows[-1].event) if has_next_page and page_rows else None

    like_states = like_states_for_events(
        db,
        user_id,
        [
            (row.event.id, row.actor_profile.user_id, row.actor_profile.hide_like_counts)
            for row in page_rows
        ],
    )

    return FeedListResponse(
        events=[
            _feed_event_response(row, like_states[row.event.id])
            for row in page_rows
        ],
        next_cursor=next_cursor,
    )


def _feed_event_response(
    row: FeedEventRow,
    like_state: tuple[int | None, bool],
) -> FeedEventResponse:
    """Build the public feed event response from joined rows."""
    like_count, liked_by_viewer = like_state
    return FeedEventResponse(
        id=row.event.id,
        event_type=row.event.event_type,
        new_bucket=row.event.new_bucket,
        new_score=row.event.new_score,
        note=row.event.note,
        created_at=row.event.created_at,
        actor_profile=ProfileResponse.model_validate(row.actor_profile),
        song=SongResponse.model_validate(row.song),
        like_count=like_count,
        liked_by_viewer=liked_by_viewer,
    )


def _parse_cursor(
    cursor: str | None,
) -> tuple[datetime | None, int | None]:
    """Parse a created_at/id cursor for descending feed pagination."""
    if cursor is None:
        return None, None

    parts = cursor.split("|")
    if len(parts) != 2:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor.",
        )

    try:
        return datetime.fromisoformat(parts[0]), int(parts[1])
    except ValueError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid cursor.",
        )


def _build_cursor(
    event: RatingEvent,
) -> str:
    """Build a cursor from the last event in the current page."""
    return f"{event.created_at.isoformat()}|{event.id}"
