from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """
    Base class for all SQLAlchemy database models.
    Every model inherits from this so Alembic can detect
    schema changes and generate migrations automatically.
    """
    pass


# Two linter warnings being suppressed:                                                                                                                                                                                                                        
#   - F401 — "imported but unused"                                          
#   - E402 — "module level import not at top of file"  
# User inherits from Base, so user.py imports Base from base.py. 
# If base.py also imports from user.py, each file is waiting for the other to finish loading first.

# Import all models here so Alembic can detect them automatically.
# Add a new import here each time a new model is created. 
from src.models.user import User  # noqa: F401, E402    