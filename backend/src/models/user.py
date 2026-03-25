from datetime import datetime

from sqlalchemy import DateTime, String, func
from sqlalchemy.orm import Mapped, mapped_column

from src.db.base import Base


class User(Base):
    """
    The class IS the table.
    Each class attribute that uses mapped_column() becomes a column.
    Instantiating a 'User' represents creating a row in the `users` table.
        i.e. user = User(email="...", hashed_password="..."),

    SQLAlchemy maps this class directly to the database table.
    Never instantiate this manually outside of a DB session; 
    use the repository layer instead because the repository is the 
    only place that has a session to actually save it. 
    If you create a User somewhere else and never add it to a session, 
    nothing happens — no row, noerror, just a Python object that disappears.  
    """

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    email: Mapped[str] = mapped_column(String(254), unique=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(72), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        nullable=False,
        server_default=func.now(),  # DB sets this on insert — never trust client time
    )
