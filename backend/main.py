from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.core.config import settings
from src.core.limiter import limiter
from src.routers import auth

app = FastAPI(title="LISTn API")

# CORS (Cross-Origin Resource Sharing) — browsers block requests from one origin
# (e.g. localhost:8081) to a different origin (localhost:8000) unless the server
# explicitly allows it. This middleware adds the headers that tell the browser
# "yes, the frontend at these origins is allowed to talk to me."
# In development this is our local Expo server; before production we'll set
# explicit app domain(s) instead.
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins.split(","),  # comma-separated list from .env
    allow_credentials=True,  # allows the frontend to send cookies / auth headers
    allow_methods=["*"],     # allow GET, POST, PUT, DELETE, etc.
    allow_headers=["*"],     # allow Authorization header (needed for JWT)
)

# Wire the rate limiter into the app so slowapi can intercept requests.
# When a route's limit is exceeded, _rate_limit_exceeded_handler converts
# the internal error into a proper HTTP 429 "Too Many Requests" response.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.include_router(auth.router, prefix="/api/v1")


@app.get("/api/v1/health")
def health():
    """Returns 200 if the server is running."""
    return {"status": "ok"}
