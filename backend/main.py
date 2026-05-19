# Application entry point.
# Creates the FastAPI app, attaches middleware, registers exception handlers,
# and mounts all routers under /api/v1.
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.core.config import settings
from src.core.limiter import limiter
from src.api_routers import auth, profile, rating, search

app = FastAPI(title="LISTn API")

# CORS (Cross-Origin Resource Sharing) middlware lets browsers make cross-origin requests to this API.
# Without it, browsers block requests from one origin e.g. localhost:8081 to a 
# different origin (localhost:8000) unless the server explicitly allows it. 
# This middleware adds the headers that tell the browser
# "yes, the frontend at these origins is allowed to talk to me."
# In development this is our local Expo server
# For production, replace cors_origins with the explicit app domain.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.cors_origins],
    allow_credentials=True,  # allows the frontend to send cookies / auth headers
    allow_methods=["*"],     # allow GET, POST, PUT, DELETE, etc.
    allow_headers=["*"],     # allow Authorization header (needed for JWT)
)

# Wire the rate limiter into app.state so slowapi can find it when decorators fire and intercept requests.
app.state.limiter = limiter
app.add_exception_handler(
    RateLimitExceeded,             # When a route's limit is exceeded
    _rate_limit_exceeded_handler,  # converts slowapi's internal error into HTTP 429 "Too Many Requests" response.
)

# Mount routers
app.include_router(
    auth.router,
    prefix="/api/v1",
)
app.include_router(
    profile.router,
    prefix="/api/v1",
)
app.include_router(
    search.router,
    prefix="/api/v1",
)
app.include_router(
    rating.router,
    prefix="/api/v1",
)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    """Return 200 to confirm the server is reachable."""
    return {"status": "ok"}
