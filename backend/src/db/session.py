# Database engine and session factory.
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from src.core.config import settings

# engine holds the connection pool that create_engine sets up.
# With sync SQLAlchemy + psycopg2 the default pool size is ok for development; tune pool_size in production.
engine = create_engine(settings.database_url)

# SessionLocal is a factory — each request gets its own session instance (created and closed in the get_db dependency)
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
)