# Database access layer for blocks.
from sqlalchemy import select
from sqlalchemy.orm import Session

from src.sqlalchemy_tables.block import Block
from src.sqlalchemy_tables.profile import Profile


def get_block(
    db: Session,
    blocker_id: int,
    blocked_id: int,
) -> Block | None:
    """Return the block row for blocker -> blocked, or None."""
    return db.execute(
        select(Block)
        .where(Block.blocker_id == blocker_id)
        .where(Block.blocked_id == blocked_id)
    ).scalar_one_or_none()


def has_block_between(
    db: Session,
    user_a_id: int,
    user_b_id: int,
) -> bool:
    """Return True when either user blocks the other."""
    return db.execute(
        select(Block.id)
        .where(
            (
                (Block.blocker_id == user_a_id)
                & (Block.blocked_id == user_b_id)
            )
            | (
                (Block.blocker_id == user_b_id)
                & (Block.blocked_id == user_a_id)
            )
        )
    ).scalar_one_or_none() is not None


def create_block(
    db: Session,
    blocker_id: int,
    blocked_id: int,
) -> Block:
    """Stage a new block row and return the flushed instance."""
    block = Block(
        blocker_id=blocker_id,
        blocked_id=blocked_id,
    )
    db.add(block)
    db.flush()
    return block


def delete_block(
    db: Session,
    block: Block,
) -> None:
    """Stage a block row for deletion."""
    db.delete(block)


def list_blocked_profiles(
    db: Session,
    blocker_id: int,
) -> list[Profile]:
    """Return profiles blocked by this user, newest block first."""
    return list(
        db.execute(
            select(Profile)
            .join(Block, Block.blocked_id == Profile.user_id)
            .where(Block.blocker_id == blocker_id)
            .order_by(Block.created_at.desc())
        ).scalars()
    )
