# Declarative base shared by all SQLAlchemy models and consumed by Alembic
# for schema introspection. Nothing else belongs in this file.
from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    Base class for all SQLAlchemy database models.

    Every model (User, Song, Ranking, etc.) inherits from this class.
    SQLAlchemy uses Base.metadata to track all table definitions.
    Alembic reads Base.metadata to detect schema changes and generate migrations.

    Models are NOT imported here to avoid circular imports (model → base → model).
    Instead, each consumer imports the models it needs:
      - alembic/env.py imports all models so migrations see every table
      - tests/conftest.py imports all models so create_all() sees every table
    Add a new import in both places whenever a new model file is created.
    """

    pass