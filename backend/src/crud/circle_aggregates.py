"""Database access for circle-aggregate discovery modules (Most-rated, Trending).

All visibility/block/deleted-user/only_me enforcement is delegated to the shared
`circle_visible_taste_owner_predicate` so these modules share one source of truth with
the rest of the social surfaces. The predicate also excludes the viewer from every
aggregate (`owner_id != viewer_id`), so the viewer can never pad their own circle counts.
"""
from dataclasses import dataclass
from datetime import datetime, timezone

from sqlalchemy import and_, exists, func, select
from sqlalchemy.orm import Session, aliased

from src.crud.social_access import (
    circle_visible_taste_owner_predicate,
    followed_visible_taste_owner_predicate,
)
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.ranking import Ranking
from src.sqlalchemy_tables.rating_event import RatingEvent
from src.sqlalchemy_tables.song import Song

# Rating events that represent an actual rating/rerating (i.e. produce a current ranking).
# Deliberately excludes "removed", "reordered", and comparison tombstones
# ("comparison_canceled", "comparison_abandoned"), which are not fresh rating activity.
ELIGIBLE_RATING_EVENT_TYPES = (
    "rated",
    "rerated",
)


@dataclass(frozen=True)
class CircleAggregateRow:
    """One song's circle aggregate: how many visible circle members and their average."""

    song_id: int
    contributor_count: int
    average_score: float
    latest_at: datetime


@dataclass(frozen=True)
class CircleContributorRow:
    """One visible circle member's current ranking, paired with their profile."""

    profile: Profile
    score: float
    bucket: str


@dataclass(frozen=True)
class CircleConsensusRow:
    """One song's friend-consensus stats: friend count, average, spread, and latest friend activity."""

    song_id: int
    contributor_count: int
    average_score: float
    score_stddev: float
    # Max eligible friend rating-event time (None if a current ranking has no rated/rerated event,
    # e.g. some seeded rows). Drives the freshness signal and the candidate ordering.
    latest_at: datetime | None


@dataclass(frozen=True)
class CircleDisagreementRow:
    """One song where the viewer's score diverges from their friends' average, with the gap."""

    song_id: int
    your_score: float
    friends_average: float
    friends_count: int
    gap: float


@dataclass(frozen=True)
class CircleSplitRow:
    """One song where two people the viewer follows are far apart (their pairwise score gap)."""

    song_id: int
    gap: float
    rater_count: int


def aggregate_circle_most_rated(
    db: Session,
    viewer_id: int,
    *,
    minimum_contributors: int,
    limit: int,
) -> list[CircleAggregateRow]:
    """Return songs ranked by how many visible circle members currently rate them."""
    contributor_count = func.count()
    average_score = func.avg(Ranking.score)
    latest_at = func.max(Ranking.updated_at)
    rows = db.execute(
        select(
            Ranking.song_id,
            contributor_count.label("contributor_count"),
            average_score.label("average_score"),
            latest_at.label("latest_at"),
        )
        .where(
            circle_visible_taste_owner_predicate(
                viewer_id,
                Ranking.user_id,
            )
        )
        .group_by(Ranking.song_id)
        .having(contributor_count >= minimum_contributors)
        .order_by(
            contributor_count.desc(),
            average_score.desc(),
            latest_at.desc(),
            Ranking.song_id.asc(),
        )
        .limit(limit)
    ).all()
    return [
        CircleAggregateRow(
            song_id=row.song_id,
            contributor_count=row.contributor_count,
            average_score=float(row.average_score),
            latest_at=row.latest_at,
        )
        for row in rows
    ]


def aggregate_circle_trending(
    db: Session,
    viewer_id: int,
    *,
    window_start: datetime,
    minimum_contributors: int,
    limit: int,
) -> list[CircleAggregateRow]:
    """Return songs ranked by distinct visible circle members who rated them recently.

    Recent activity is sourced from `rating_events` inside the window, then joined back
    to current `rankings`. The join drops members who removed the song (no current
    ranking), and the DISTINCT collapses a member who rerated several times to one.
    """
    recent_activity = (
        select(
            RatingEvent.user_id,
            RatingEvent.song_id,
        )
        .where(RatingEvent.created_at >= window_start)
        .where(RatingEvent.event_type.in_(ELIGIBLE_RATING_EVENT_TYPES))
        .where(
            circle_visible_taste_owner_predicate(
                viewer_id,
                RatingEvent.user_id,
            )
        )
        .distinct()
        .cte("recent_circle_activity")
    )
    contributor_count = func.count()
    average_score = func.avg(Ranking.score)
    latest_at = func.max(Ranking.updated_at)
    rows = db.execute(
        select(
            Ranking.song_id,
            contributor_count.label("contributor_count"),
            average_score.label("average_score"),
            latest_at.label("latest_at"),
        )
        .select_from(recent_activity)
        .join(
            Ranking,
            and_(
                Ranking.user_id == recent_activity.c.user_id,
                Ranking.song_id == recent_activity.c.song_id,
            ),
        )
        .group_by(Ranking.song_id)
        .having(contributor_count >= minimum_contributors)
        .order_by(
            contributor_count.desc(),
            latest_at.desc(),
            average_score.desc(),
            Ranking.song_id.asc(),
        )
        .limit(limit)
    ).all()
    return [
        CircleAggregateRow(
            song_id=row.song_id,
            contributor_count=row.contributor_count,
            average_score=float(row.average_score),
            latest_at=row.latest_at,
        )
        for row in rows
    ]


def list_circle_contributors(
    db: Session,
    viewer_id: int,
    song_ids: list[int],
    *,
    per_song_limit: int,
    window_start: datetime | None = None,
) -> dict[int, list[CircleContributorRow]]:
    """Return the top visible circle contributors per song, highest current score first.

    When `window_start` is given (Trending), contributors are restricted to circle members
    with eligible recent activity, so the chips match the recent cohort the count describes.
    """
    if not song_ids:
        return {}
    statement = (
        select(
            Ranking.song_id,
            Profile,
            Ranking.score,
            Ranking.bucket,
        )
        .join(
            Profile,
            Profile.user_id == Ranking.user_id,
        )
        .where(Ranking.song_id.in_(song_ids))
        .where(
            circle_visible_taste_owner_predicate(
                viewer_id,
                Ranking.user_id,
            )
        )
    )
    if window_start is not None:
        recent_event = aliased(RatingEvent)
        statement = statement.where(
            exists(
                select(recent_event.id)
                .where(recent_event.user_id == Ranking.user_id)
                .where(recent_event.song_id == Ranking.song_id)
                .where(recent_event.created_at >= window_start)
                .where(recent_event.event_type.in_(ELIGIBLE_RATING_EVENT_TYPES))
            )
        )
    rows = db.execute(
        statement
        .order_by(
            Ranking.song_id.asc(),
            Ranking.score.desc(),
            Ranking.updated_at.desc(),
        )
    ).all()
    contributors: dict[int, list[CircleContributorRow]] = {}
    for song_id, profile, score, bucket in rows:
        per_song = contributors.setdefault(song_id, [])
        if len(per_song) < per_song_limit:
            per_song.append(
                CircleContributorRow(
                    profile=profile,
                    score=score,
                    bucket=bucket,
                )
            )
    return contributors


def get_viewer_rankings(
    db: Session,
    viewer_id: int,
    song_ids: list[int],
) -> dict[int, Ranking]:
    """Return the viewer's own current rankings for the given songs, keyed by song id."""
    if not song_ids:
        return {}
    rankings = db.execute(
        select(Ranking)
        .where(Ranking.user_id == viewer_id)
        .where(Ranking.song_id.in_(song_ids))
    ).scalars().all()
    return {ranking.song_id: ranking for ranking in rankings}


def get_songs_by_ids(
    db: Session,
    song_ids: list[int],
) -> dict[int, Song]:
    """Return songs for the given ids, keyed by id, for response assembly."""
    if not song_ids:
        return {}
    songs = db.execute(
        select(Song)
        .where(Song.id.in_(song_ids))
    ).scalars().all()
    return {song.id: song for song in songs}


def circle_consensus_candidates(
    db: Session,
    viewer_id: int,
    *,
    minimum_contributors: int,
    limit: int,
) -> list[CircleConsensusRow]:
    """Songs the viewer's friends collectively rate, with friend average, spread, and latest activity.

    Friends = mutual follows visible to the viewer; the shared circle predicate also excludes the
    viewer from the aggregate, so contributor_count/average_score/score_stddev never include the
    viewer's own ranking. Count/avg/spread come from current `rankings`; recency (`latest_at`) is the
    max eligible (`rated`/`rerated`) friend rating-event time — sourced from `rating_events`, not
    `rankings.updated_at`. Candidates are ordered **most-recently-active first** (a left join keeps
    songs whose rankings have no eligible event, ordered last via the epoch coalesce), so a freshly
    qualifying song is never truncated out of the scored set before the service ranks it.
    """
    recent_at = (
        select(
            RatingEvent.song_id.label("song_id"),
            func.max(RatingEvent.created_at).label("latest_at"),
        )
        .where(RatingEvent.event_type.in_(ELIGIBLE_RATING_EVENT_TYPES))
        .where(
            circle_visible_taste_owner_predicate(
                viewer_id,
                RatingEvent.user_id,
            )
        )
        .group_by(RatingEvent.song_id)
        .cte("circle_recent_at")
    )
    contributor_count = func.count()
    average_score = func.avg(Ranking.score)
    score_stddev = func.stddev_samp(Ranking.score)
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    rows = db.execute(
        select(
            Ranking.song_id,
            contributor_count.label("contributor_count"),
            average_score.label("average_score"),
            score_stddev.label("score_stddev"),
            recent_at.c.latest_at.label("latest_at"),
        )
        .outerjoin(
            recent_at,
            recent_at.c.song_id == Ranking.song_id,
        )
        .where(
            circle_visible_taste_owner_predicate(
                viewer_id,
                Ranking.user_id,
            )
        )
        .group_by(
            Ranking.song_id,
            recent_at.c.latest_at,
        )
        .having(contributor_count >= minimum_contributors)
        .order_by(
            func.coalesce(recent_at.c.latest_at, epoch).desc(),
            contributor_count.desc(),
            Ranking.song_id.asc(),
        )
        .limit(limit)
    ).all()
    return [
        CircleConsensusRow(
            song_id=row.song_id,
            contributor_count=row.contributor_count,
            average_score=float(row.average_score),
            # stddev_samp is NULL for a single row, but we require >= 3 contributors, so it's defined.
            score_stddev=float(row.score_stddev) if row.score_stddev is not None else 0.0,
            latest_at=row.latest_at,
        )
        for row in rows
    ]


def circle_score_distribution(
    db: Session,
    viewer_id: int,
    song_id: int,
) -> list[float]:
    """All visible friends' current scores for one song (viewer excluded), for the histogram."""
    scores = db.execute(
        select(Ranking.score)
        .where(Ranking.song_id == song_id)
        .where(
            circle_visible_taste_owner_predicate(
                viewer_id,
                Ranking.user_id,
            )
        )
    ).scalars().all()
    return [float(score) for score in scores]


def viewer_rated_artist_ids(
    db: Session,
    viewer_id: int,
) -> set[int]:
    """Distinct artist ids the viewer has rated — the Consensus 'your relevance' signal."""
    artist_ids = db.execute(
        select(Song.artist_deezer_id)
        .join(
            Ranking,
            Ranking.song_id == Song.id,
        )
        .where(Ranking.user_id == viewer_id)
        .distinct()
    ).scalars().all()
    return {int(artist_id) for artist_id in artist_ids}


def split_decision_candidates(
    db: Session,
    viewer_id: int,
    *,
    minimum_raters: int,
    min_gap: float,
    limit: int,
) -> list[CircleSplitRow]:
    """Songs where two people the viewer follows are far apart, biggest pairwise gap first.

    Audience = followed-visible people (one-way follow allowed, viewer excluded) via
    `followed_visible_taste_owner_predicate` — NOT the mutual circle. gap = max(score) - min(score)
    among them. Gap-primary: the gap filter and ordering happen in SQL and the `limit` is applied
    *after* gap ordering, so a big-gap song is never truncated out before the service ranks it. The
    recency tie-break counts only events from people who CURRENTLY rank the song (join to `Ranking`),
    so a stale event from someone who removed their rating can't skew it.
    """
    recent_at = (
        select(
            RatingEvent.song_id.label("song_id"),
            func.max(RatingEvent.created_at).label("latest_at"),
        )
        .join(
            Ranking,
            and_(
                Ranking.user_id == RatingEvent.user_id,
                Ranking.song_id == RatingEvent.song_id,
            ),
        )
        .where(RatingEvent.event_type.in_(ELIGIBLE_RATING_EVENT_TYPES))
        .where(
            followed_visible_taste_owner_predicate(
                viewer_id,
                RatingEvent.user_id,
            )
        )
        .group_by(RatingEvent.song_id)
        .cte("split_recent_at")
    )
    rater_count = func.count()
    gap = func.max(Ranking.score) - func.min(Ranking.score)
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    rows = db.execute(
        select(
            Ranking.song_id,
            rater_count.label("rater_count"),
            gap.label("gap"),
        )
        .outerjoin(
            recent_at,
            recent_at.c.song_id == Ranking.song_id,
        )
        .where(
            followed_visible_taste_owner_predicate(
                viewer_id,
                Ranking.user_id,
            )
        )
        .group_by(
            Ranking.song_id,
            recent_at.c.latest_at,
        )
        .having(and_(rater_count >= minimum_raters, gap >= min_gap))
        .order_by(
            gap.desc(),
            func.coalesce(recent_at.c.latest_at, epoch).desc(),
            rater_count.desc(),
            Ranking.song_id.asc(),
        )
        .limit(limit)
    ).all()
    return [
        CircleSplitRow(
            song_id=row.song_id,
            gap=float(row.gap),
            rater_count=row.rater_count,
        )
        for row in rows
    ]


def followed_visible_song_raters(
    db: Session,
    viewer_id: int,
    song_id: int,
) -> list[tuple[Profile, float, int]]:
    """(profile, score, user_id) for followed-visible people who currently rate one song.

    Viewer excluded by the predicate. The caller derives the high/low pair deterministically.
    """
    rows = db.execute(
        select(
            Ranking.user_id,
            Ranking.score,
            Profile,
        )
        .join(
            Profile,
            Profile.user_id == Ranking.user_id,
        )
        .where(Ranking.song_id == song_id)
        .where(
            followed_visible_taste_owner_predicate(
                viewer_id,
                Ranking.user_id,
            )
        )
    ).all()
    return [(profile, float(score), user_id) for user_id, score, profile in rows]


def circle_disagreement_candidates(
    db: Session,
    viewer_id: int,
    *,
    minimum_contributors: int,
    min_gap: float,
    limit: int,
) -> list[CircleDisagreementRow]:
    """Songs where the viewer's score diverges from their friends' average, biggest gap first.

    Disagreement Spotlight is **gap-primary**, so the gap filter and ordering happen here in SQL and
    the `limit` is applied *after* gap ordering — a large-gap song is never truncated out (the reason
    this is a dedicated query, not a reuse of the recency-capped consensus pool). "Friends" = mutual
    follows visible to the viewer via `circle_visible_taste_owner_predicate`, which also excludes the
    viewer, so `friends_average`/count never include the viewer's own ranking. The viewer's own score
    is joined in separately. Recency (latest eligible friend event) is only a tie-break.
    """
    friends = (
        select(
            Ranking.song_id.label("song_id"),
            func.count().label("friends_count"),
            func.avg(Ranking.score).label("friends_average"),
        )
        .where(
            circle_visible_taste_owner_predicate(
                viewer_id,
                Ranking.user_id,
            )
        )
        .group_by(Ranking.song_id)
        .having(func.count() >= minimum_contributors)
        .cte("circle_friends_agg")
    )
    # Recency only counts events from friends who CURRENTLY rank the song (the same contributors as
    # the average), via a join to their current Ranking — so a stale event from a friend who has since
    # removed their rating can't skew the freshness tie-break.
    recent_at = (
        select(
            RatingEvent.song_id.label("song_id"),
            func.max(RatingEvent.created_at).label("latest_at"),
        )
        .join(
            Ranking,
            and_(
                Ranking.user_id == RatingEvent.user_id,
                Ranking.song_id == RatingEvent.song_id,
            ),
        )
        .where(RatingEvent.event_type.in_(ELIGIBLE_RATING_EVENT_TYPES))
        .where(
            circle_visible_taste_owner_predicate(
                viewer_id,
                RatingEvent.user_id,
            )
        )
        .group_by(RatingEvent.song_id)
        .cte("circle_disagree_recent_at")
    )
    viewer_ranking = aliased(Ranking)
    gap = func.abs(viewer_ranking.score - friends.c.friends_average)
    epoch = datetime(1970, 1, 1, tzinfo=timezone.utc)
    rows = db.execute(
        select(
            friends.c.song_id,
            viewer_ranking.score.label("your_score"),
            friends.c.friends_average,
            friends.c.friends_count,
            gap.label("gap"),
        )
        .join(
            viewer_ranking,
            and_(
                viewer_ranking.song_id == friends.c.song_id,
                viewer_ranking.user_id == viewer_id,
            ),
        )
        .outerjoin(
            recent_at,
            recent_at.c.song_id == friends.c.song_id,
        )
        .where(gap >= min_gap)
        .order_by(
            gap.desc(),
            func.coalesce(recent_at.c.latest_at, epoch).desc(),
            friends.c.friends_count.desc(),
            friends.c.song_id.asc(),
        )
        .limit(limit)
    ).all()
    return [
        CircleDisagreementRow(
            song_id=row.song_id,
            your_score=float(row.your_score),
            friends_average=float(row.friends_average),
            friends_count=row.friends_count,
            gap=float(row.gap),
        )
        for row in rows
    ]
