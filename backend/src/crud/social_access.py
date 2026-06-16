"""Reusable SQL predicates for taste-bearing social surfaces."""
from sqlalchemy import and_, exists, or_, select
from sqlalchemy.orm import aliased
from sqlalchemy.sql.elements import ColumnElement

from src.sqlalchemy_tables.block import Block
from src.sqlalchemy_tables.follow import Follow
from src.sqlalchemy_tables.profile import Profile
from src.sqlalchemy_tables.user import User


def visible_taste_owner_predicate(
    viewer_id: int,
    owner_id_column: ColumnElement[int],
    *,
    include_self: bool = True,
) -> ColumnElement[bool]:
    """Return a composable predicate enforcing taste visibility and blocks."""
    owner_user = aliased(User)
    public_profile = aliased(Profile)
    friends_profile = aliased(Profile)
    owner_profile = aliased(Profile)
    viewer_follow = aliased(Follow)
    owner_follow = aliased(Follow)
    relationship_block = aliased(Block)
    owner_exists = exists(
        select(owner_user.id)
        .where(owner_user.id == owner_id_column)
    )
    viewer_follows_owner = exists(
        select(viewer_follow.id)
        .where(viewer_follow.follower_id == viewer_id)
        .where(viewer_follow.following_id == owner_id_column)
    )
    owner_follows_viewer = exists(
        select(owner_follow.id)
        .where(owner_follow.follower_id == owner_id_column)
        .where(owner_follow.following_id == viewer_id)
    )
    public_profile_exists = exists(
        select(public_profile.id)
        .where(public_profile.user_id == owner_id_column)
        .where(public_profile.visibility == "public")
    )
    friends_profile_exists = exists(
        select(friends_profile.id)
        .where(friends_profile.user_id == owner_id_column)
        .where(friends_profile.visibility == "friends_only")
    )
    owner_profile_exists = exists(
        select(owner_profile.id)
        .where(owner_profile.user_id == owner_id_column)
    )
    block_exists = exists(
        select(relationship_block.id)
        .where(
            or_(
                and_(
                    relationship_block.blocker_id == viewer_id,
                    relationship_block.blocked_id == owner_id_column,
                ),
                and_(
                    relationship_block.blocker_id == owner_id_column,
                    relationship_block.blocked_id == viewer_id,
                ),
            )
        )
    )
    return and_(
        owner_exists,
        or_(
            public_profile_exists,
            and_(
                friends_profile_exists,
                viewer_follows_owner,
                owner_follows_viewer,
            ),
            and_(
                include_self,
                owner_id_column == viewer_id,
                owner_profile_exists,
            ),
        ),
        ~block_exists,
    )


def followed_visible_taste_owner_predicate(
    viewer_id: int,
    owner_id_column: ColumnElement[int],
) -> ColumnElement[bool]:
    """Return visible taste owners followed by the viewer for discovery/feed use."""
    viewer_follow = aliased(Follow)
    viewer_follows_owner = exists(
        select(viewer_follow.id)
        .where(viewer_follow.follower_id == viewer_id)
        .where(viewer_follow.following_id == owner_id_column)
    )
    return and_(
        owner_id_column != viewer_id,
        viewer_follows_owner,
        visible_taste_owner_predicate(
            viewer_id,
            owner_id_column,
            include_self=False,
        ),
    )


def circle_visible_taste_owner_predicate(
    viewer_id: int,
    owner_id_column: ColumnElement[int],
) -> ColumnElement[bool]:
    """Return circle members: mutual follows whose taste is visible to the viewer.

    "Your circle" means mutual follows whose taste is visible to the viewer. This
    is stricter than followed_visible_taste_owner_predicate, which only requires a
    one-way follow — circle aggregates require the follow to go both directions.
    Visibility, blocks, only_me, and deleted-user exclusion are delegated to
    visible_taste_owner_predicate so circle modules share one source of truth.
    """
    viewer_follow = aliased(Follow)
    owner_follow = aliased(Follow)
    viewer_follows_owner = exists(
        select(viewer_follow.id)
        .where(viewer_follow.follower_id == viewer_id)
        .where(viewer_follow.following_id == owner_id_column)
    )
    owner_follows_viewer = exists(
        select(owner_follow.id)
        .where(owner_follow.follower_id == owner_id_column)
        .where(owner_follow.following_id == viewer_id)
    )
    return and_(
        owner_id_column != viewer_id,
        viewer_follows_owner,
        owner_follows_viewer,
        visible_taste_owner_predicate(
            viewer_id,
            owner_id_column,
            include_self=False,
        ),
    )
