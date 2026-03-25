from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from src.core.config import settings


# The engine manages the connection pool to PostgreSQL
engine = create_engine(settings.database_url)

# SessionLocal is a factory — each request gets its own session instance
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,  # we control when to commit
    autoflush=False,   # we control when to flush
)