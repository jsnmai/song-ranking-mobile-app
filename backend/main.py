"""Application entry point."""
import logging
from collections.abc import Awaitable, Callable
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.api_routers import auth, comparison, feed, profile, rating, search, song
from src.core.config import settings
from src.core.limiter import limiter

logger = logging.getLogger("listn.api")

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
    search.router,
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
    song.router,
    prefix="/api/v1",
)


@app.get("/api/v1/health")
def health() -> dict[str, str]:
    """Return 200 to confirm the server is reachable."""
    return {"status": "ok"}
