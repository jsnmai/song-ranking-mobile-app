from logging.config import fileConfig

from sqlalchemy import engine_from_config
from sqlalchemy import pool

from alembic import context

from src.core.config import settings
from src.db.base import Base
import src.sqlalchemy_tables.user  # noqa: F401 — registers User with Base.metadata so Alembic sees the table
import src.sqlalchemy_tables.profile  # noqa: F401 — registers Profile with Base.metadata so Alembic sees the table
import src.sqlalchemy_tables.song  # noqa: F401 — registers Song with Base.metadata so Alembic sees the table
import src.sqlalchemy_tables.ranking  # noqa: F401 — registers Ranking with Base.metadata so Alembic sees the table
import src.sqlalchemy_tables.rating_event  # noqa: F401 — registers RatingEvent with Base.metadata so Alembic sees the table
import src.sqlalchemy_tables.comparison_session  # noqa: F401 — registers ComparisonSession with Base.metadata so Alembic sees the table
import src.sqlalchemy_tables.comparison  # noqa: F401 — registers Comparison with Base.metadata so Alembic sees the table
# Add a new import here each time a new model file is created.

# this is the Alembic Config object, which provides
# access to the values within the .ini file in use.
config = context.config

# Interpret the config file for Python logging.
# This line sets up loggers basically.
if config.config_file_name is not None:
    fileConfig(config.config_file_name)

# add your model's MetaData object here
# for 'autogenerate' support
# from myapp import mymodel
# target_metadata = mymodel.Base.metadata
# NOTES: Point Alembic at our models so autogenerate can diff them against the live schema.
target_metadata = Base.metadata # ADDED: tells Alembic what tables to track

# other values from the config, defined by the needs of env.py,
# can be acquired:
# my_important_option = config.get_main_option("my_important_option")
# ... etc.

# Override sqlalchemy.url with the value from .env
# NOTES: Read the database URL from .env rather than alembic.ini so there is one source of truth.
config.set_main_option("sqlalchemy.url", settings.database_url) # ADDED: reads URL from .env


def run_migrations_offline() -> None:
    """Run migrations in 'offline' mode.

    This configures the context with just a URL
    and not an Engine, though an Engine is acceptable
    here as well.  By skipping the Engine creation
    we don't even need a DBAPI to be available.

    Calls to context.execute() here emit the given string to the
    script output.

    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )

    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations in 'online' mode.

    In this scenario we need to create an Engine
    and associate a connection with the context.

    """
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )

    with connectable.connect() as connection:
        context.configure(
            connection=connection, 
            target_metadata=target_metadata
        )

        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
