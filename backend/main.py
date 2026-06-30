"""Application entry point."""
import logging
from collections.abc import Awaitable, Callable
from uuid import uuid4

import sentry_sdk
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.api_routers import (
    auth,
    bookmarks,
    circle_aggregates,
    comparison,
    comparison_history,
    events,
    feed,
    like,
    notification,
    popular,
    profile,
    rating,
    search,
    social_discovery,
    song,
)
from src.core.config import settings
from src.core.limiter import limiter

logger = logging.getLogger("listn.api")

# Sentry — initialised before the app so the FastAPI integration (auto-enabled
# when sentry-sdk[fastapi] is installed) can instrument it. No-op when SENTRY_DSN
# is unset, so this is safe to ship before the Sentry project exists.
# send_default_pii=False keeps auth headers, JWTs, and emails out of events; we
# attach only id/username as user context where a request is authenticated.
if settings.sentry_dsn:
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.sentry_environment,
        send_default_pii=False,
        traces_sample_rate=0.1,
    )

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


@app.middleware("http")
async def request_id_middleware(
    request: Request,
    call_next: Callable[[Request], Awaitable[Response]],
) -> Response:
    """Attach a request correlation ID to responses and unhandled-error logs."""
    incoming_request_id = request.headers.get("X-Request-ID")
    if incoming_request_id and len(incoming_request_id) <= 100:
        request_id = incoming_request_id
    else:
        request_id = str(uuid4())
    request.state.request_id = request_id

    try:
        response = await call_next(request)
    except Exception:
        # This middleware swallows the exception (returns a 500 below), so it
        # never propagates to Sentry's FastAPI integration — capture it here by
        # hand. set_tag writes to the request-isolated scope, so the request_id
        # rides along with the event for correlation with the client/logs.
        sentry_sdk.set_tag("request_id", request_id)
        sentry_sdk.capture_exception()
        logger.exception(
            "Unhandled request error",
            extra={
                "request_id": request_id,
                "method": request.method,
                "path": request.url.path,
            },
        )
        return JSONResponse(
            status_code=500,
            content={
                "detail": "Internal server error.",
                "request_id": request_id,
            },
            headers={"X-Request-ID": request_id},
        )

    response.headers["X-Request-ID"] = request_id
    return response


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
    feed.router,
    prefix="/api/v1",
)
app.include_router(
    like.router,
    prefix="/api/v1",
)
app.include_router(
    notification.router,
    prefix="/api/v1",
)
app.include_router(
    search.router,
    prefix="/api/v1",
)
app.include_router(
    social_discovery.router,
    prefix="/api/v1",
)
app.include_router(
    circle_aggregates.router,
    prefix="/api/v1",
)
app.include_router(
    popular.router,
    prefix="/api/v1",
)
app.include_router(
    rating.router,
    prefix="/api/v1",
)
app.include_router(
    comparison.router,
    prefix="/api/v1",
)
app.include_router(
    comparison_history.router,
    prefix="/api/v1",
)
app.include_router(
    song.router,
    prefix="/api/v1",
)
app.include_router(
    bookmarks.router,
    prefix="/api/v1",
)
app.include_router(
    events.router,
    prefix="/api/v1",
)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    """Return 200 to confirm the server is reachable."""
    return {"status": "ok"}
