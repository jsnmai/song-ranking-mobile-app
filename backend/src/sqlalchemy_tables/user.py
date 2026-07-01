# SQLAlchemy model for the `users` table.
# This is a pure table definition — no business logic lives here.
# All reads and writes go through src/crud/user.py.
from datetime import datetime

from sqlalchemy import Boolean, DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class User(Base):
    """
    The class IS the table. 
    SQLAlchemy maps this class directly to the 'users' database table.
    Each class attribute that uses mapped_column() becomes a column.
    Instantiating a 'User' represents creating a row in the `users` table.
        i.e. user = User(email="...", hashed_password="..."),

    
    Never instantiate User manually outside of a DB session; 
    use the crud layer instead, whcih is the only place that has a session 
    to actually save it. If you create a User somewhere else and never add it 
    to a session, nothing happens — no row, noerror, just a Python object that disappears.  
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(
        String(254),
        unique=True,
        nullable=False,  # 254 = RFC 5321 max email length
    )
    hashed_password: Mapped[str] = mapped_column(
        String(60),
        nullable=False,  # bcrypt output is always exactly 60 chars
    )
    age_verified_13_plus: Mapped[bool] = mapped_column(
        Boolean,
        nullable=False,
        default=False,
        server_default="false",
    )
    age_verified_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    age_gate_version: Mapped[str | None] = mapped_column(
        String(20),
        nullable=True,
    )
    password_changed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,  # set on password reset; any JWT issued at/before this time is rejected
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),  # PostgreSQL sets this on insert — never trust client time
    )
