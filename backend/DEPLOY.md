# Deploying the LISTn backend (internal TestFlight)

The backend ships as a Docker image (`backend/Dockerfile`). It installs runtime
deps from `uv.lock`, runs `alembic upgrade head` at container start, then serves
the FastAPI app with a single Uvicorn worker.

Initial host: **Railway**. The Dockerfile is host-agnostic, so the same image
runs on Render / Fly / a plain Docker host later without changes.

## Required environment variables

Set these on the host (see `.env.example` for details). All are required:

| Variable         | What it is                                                        |
|------------------|-------------------------------------------------------------------|
| `DATABASE_URL`   | Postgres URL. `postgresql://…` or `postgresql+psycopg2://…` (psycopg2). Not `+asyncpg`/`+psycopg`. |
| `JWT_SECRET_KEY` | JWT signing secret. Generate per env: `openssl rand -hex 32`.     |
| `CORS_ORIGINS`   | Single allowed CORS origin for this env.                          |

Optional (have defaults): `JWT_ALGORITHM`, `JWT_EXPIRY_DAYS`, `STREAKS_ENABLED`.

`$PORT` is injected by the host; the container honors it (defaults to 8000).

> Migrations read config via `src.core.config.settings`, so `alembic upgrade head`
> needs `DATABASE_URL`, `JWT_SECRET_KEY`, and `CORS_ORIGINS` set too — not just the DB URL.

## Single instance / single worker (important)

Keep horizontal autoscaling **off** and do not add Uvicorn `--workers`. The
slowapi rate limiter is **in-memory**, so multiple workers or instances would
each keep separate counters and silently split the limits. One instance with one
worker is plenty for internal TestFlight.

## Commands

```sh
# Build (from repo root; context is backend/)
docker build -t listn-api backend/

# Run locally against a reachable Postgres (entrypoint runs migrations first)
docker run --rm -p 8000:8000 \
  -e DATABASE_URL="postgresql+psycopg2://postgres:postgres@host.docker.internal:5432/listn" \
  -e JWT_SECRET_KEY="$(openssl rand -hex 32)" \
  -e CORS_ORIGINS="http://localhost:8081" \
  listn-api

# Migrations run automatically at container start. To run them manually:
#   (in the container)        alembic upgrade head
#   (from a local checkout)   uv run alembic upgrade head
```

Production start command (baked into the image entrypoint, no need to set it on
the host): `alembic upgrade head` then
`uvicorn main:app --host 0.0.0.0 --port $PORT`.

## Railway setup (one-time, manual)

1. Create a project; add a **PostgreSQL** plugin.
2. Add a service from this repo; set the service **Root Directory** to `backend`
   so Railway builds with the Dockerfile (it auto-detects `backend/Dockerfile`).
3. Service **Variables**:
   - `DATABASE_URL` → reference the DB plugin, e.g. `${{Postgres.DATABASE_URL}}`
   - `JWT_SECRET_KEY` → `openssl rand -hex 32`
   - `CORS_ORIGINS` → your allowed origin
   - (Railway injects `PORT` automatically.)
4. Settings → **Healthcheck Path**: `/api/v1/health`.
5. Keep **replicas = 1** (single instance — see above).
6. Deploy. Watch logs for `alembic upgrade head` then the Uvicorn start line.

## Verify the deployment is healthy

```sh
curl https://<your-service>.up.railway.app/api/v1/health
# expected: {"status":"ok"}
```

Then point the app at it: set the frontend `EXPO_PUBLIC_API_URL` to the HTTPS
URL and `CORS_ORIGINS` accordingly (frontend wiring is a separate task).
