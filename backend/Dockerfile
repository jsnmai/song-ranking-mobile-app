# Production image for the LISTn FastAPI backend.
#
# Build context is backend/:   docker build -t listn-api backend/
#
# This image installs ONLY runtime dependencies from uv.lock (no dev group,
# no editable project install) and runs database migrations at CONTAINER START
# (see docker-entrypoint.sh) — never during the build, because there is no
# database reachable at build time.

FROM python:3.11-slim

# uv is this repo's package manager. Copy the static binary from the official
# image so the build is reproducible and doesn't depend on a network installer.
COPY --from=ghcr.io/astral-sh/uv:0.11.0 /uv /uvx /bin/

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

WORKDIR /app

# 1) Dependency layer — copy only the lockfile + manifest first so this layer is
#    cached and rebuilds only when dependencies change.
#      --frozen             : fail if uv.lock is stale; never re-resolve (reproducible)
#      --no-dev             : skip the dev group (ruff, pytest)
#      --no-install-project : the app runs from source via `uvicorn main:app`; it is
#                             not packaged (no [build-system], no README.md to build)
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-install-project

# 2) Application source (after deps so source edits don't bust the dependency cache).
COPY . .
RUN chmod +x docker-entrypoint.sh

# Put the project venv on PATH so `uvicorn` / `alembic` resolve directly,
# without needing `uv run` at container start.
ENV PATH="/app/.venv/bin:$PATH"

# Run as a non-root user.
RUN useradd --create-home --uid 10001 appuser && chown -R appuser:appuser /app
USER appuser

# Railway (and most hosts) inject $PORT; default to 8000 for local runs.
ENV PORT=8000
EXPOSE 8000

ENTRYPOINT ["./docker-entrypoint.sh"]
