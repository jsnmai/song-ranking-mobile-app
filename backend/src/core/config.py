from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    All environment variables the app needs to run.
    Pydantic will raise an error on startup if any required variable is missing.
    """

    # Database
    database_url: str

    model_config = SettingsConfigDict(
        env_file=".env",
        case_sensitive=False,
    )


# Single instance imported everywhere:
# from src.core.config import settings
settings = Settings()