# Pydantic schemas for the social feed.
from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from src.pydantic_schemas.profile import ProfileResponse
from src.pydantic_schemas.rating import BucketName, RatingEventType
from src.pydantic_schemas.song import SongResponse


class FeedEventResponse(BaseModel):
    """One social feed item from a followed user's rating activity."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    event_type: RatingEventType
    new_bucket: BucketName
    new_score: float
    note: str | None
    created_at: datetime
    actor_profile: ProfileResponse
    song: SongResponse
    # like_count is None when the actor hides their like counts and the viewer isn't them.
    like_count: int | None = None
    liked_by_viewer: bool = False


class FeedListResponse(BaseModel):
    """Cursor-paginated social feed response."""

    events: list[FeedEventResponse]
    next_cursor: str | None


class CircleRatersResponse(BaseModel):
    """Circle members (mutual follows, visible to the viewer) who currently rate one song.

    Powers the Recent Verdict hero's social-proof avatars. The total LISTn rating count is
    already on the song (`global_rating_count`), so it is not duplicated here.
    """

    raters: list[ProfileResponse]


class RerateRadarItem(BaseModel):
    """Re-rate Radar: one followed user's recent score change on a song (the delta)."""

    model_config = ConfigDict(from_attributes=True)

    rating_event_id: int
    actor_profile: ProfileResponse
    song: SongResponse
    previous_bucket: BucketName
    previous_score: float
    new_bucket: BucketName
    new_score: float
    note: str | None
    created_at: datetime


class ConsensusModule(BaseModel):
    """Consensus: how the viewer's friends (mutual follows) collectively scored one song.

    Shows the friend average, the friend count, a 10-bin score distribution, and the low/high friend
    scores (the spread bar's endpoints). The viewer's own rating is never part of the aggregate.
    Friends = mutual follows, visible to the viewer (the same circle predicate the rest of the social
    surfaces use).
    """

    model_config = ConfigDict(from_attributes=True)

    song: SongResponse
    average_score: float
    contributor_count: int
    # Always exactly 10 bins: scores [0,1), [1,2), … [9,10].
    distribution: list[int]
    # Lowest and highest friend score — the endpoints of the spread bar (viewer excluded).
    low_score: float
    high_score: float


class DisagreementModule(BaseModel):
    """Disagreement Spotlight: the song where the viewer's score diverges most from their friends'.

    "Friends" = mutual follows visible to the viewer (the shared circle predicate); the viewer is
    excluded from `friends_average`. `gap` is the absolute difference (the "X.X APART" badge);
    `direction` says whether the viewer rated it higher or lower than friends.
    """

    model_config = ConfigDict(from_attributes=True)

    song: SongResponse
    your_score: float
    friends_average: float
    friends_count: int
    gap: float
    direction: str  # "viewer_higher" | "friends_higher"


class SplitPerson(BaseModel):
    """One side of a Split Decision: a person the viewer follows + their score on the song."""

    model_config = ConfigDict(from_attributes=True)

    profile: ProfileResponse
    score: float


class SplitDecisionModule(BaseModel):
    """Split Decision: a song where two people the viewer follows are far apart.

    Participants are followed-visible people (one-way follow allowed), NOT necessarily mutual
    friends, and never the viewer. `high` is the higher scorer, `low` the lower; `gap` = high − low.
    """

    model_config = ConfigDict(from_attributes=True)

    song: SongResponse
    high: SplitPerson
    low: SplitPerson
    gap: float


class MatchMomentModule(BaseModel):
    """Match Moment: a recent finalized head-to-head pick by someone the viewer follows.

    The actor chose `winner` over `loser` in the ranking flow. Audience = followed-visible people
    (one-way follow allowed), never the viewer. `decision_duration_ms` is how long the pick took
    (None for legacy rows) and powers an optional "snap pick" flourish.
    """

    model_config = ConfigDict(from_attributes=True)

    actor_profile: ProfileResponse
    winner: SongResponse
    loser: SongResponse
    decision_duration_ms: int | None
    created_at: datetime


class ThisOrThatOption(BaseModel):
    """One already-rated song in a personal ranking-refinement prompt."""

    model_config = ConfigDict(from_attributes=True)

    ranking_id: int
    song: SongResponse
    bucket: BucketName
    position: int
    score: float


class ThisOrThatModule(BaseModel):
    """Inline Feed prompt asking the viewer to refine two adjacent ranked songs."""

    left: ThisOrThatOption
    right: ThisOrThatOption
    bucket: BucketName


class ThisOrThatChoiceRequest(BaseModel):
    """Submit one inline This-or-That decision from the Feed."""

    left_song_id: int = Field(ge=1)
    right_song_id: int = Field(ge=1)
    winner_song_id: int = Field(ge=1)


class ThisOrThatDismissRequest(BaseModel):
    """Dismiss the visible This-or-That prompt, including the pair when available."""

    left_song_id: int | None = Field(
        default=None,
        ge=1,
    )
    right_song_id: int | None = Field(
        default=None,
        ge=1,
    )


class ThisOrThatChoiceResponse(BaseModel):
    """Acknowledgement for a recorded This-or-That decision."""

    recorded: bool
    swapped: bool
    winner_song_id: int


class ThisOrThatDismissResponse(BaseModel):
    """Acknowledgement for dismissing the current This-or-That prompt."""

    dismissed: bool


class FeedModulesResponse(BaseModel):
    """Bundled Feed module aggregates served behind the shared social-access privacy layer.

    One endpoint backs every Feed module card so the Feed makes a single request and the
    privacy filtering runs once per load (the paginated activity stream stays its own /feed).
    All fields default to null so the bundled module gate (rated >= 10 and following >= 3) can
    short-circuit to an empty response, and so any individual module with no data stays locked.
    """

    this_or_that: ThisOrThatModule | None = None
    rerate_radar: RerateRadarItem | None = None
    consensus: ConsensusModule | None = None
    disagreement_spotlight: DisagreementModule | None = None
    split_decision: SplitDecisionModule | None = None
    match_moment: MatchMomentModule | None = None
