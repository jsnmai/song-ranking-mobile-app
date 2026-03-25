from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    Base class for all SQLAlchemy database models.
    Every model inherits from this so Alembic can detect
    schema changes and generate migrations automatically.
    """
    pass

