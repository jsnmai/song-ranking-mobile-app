#!/bin/sh
# Container entrypoint: apply migrations, then start the API.
#
# Migrations run HERE (container start), never during `docker build` — there is
# no database at build time. This is safe because the TestFlight deployment runs
# a SINGLE instance with a SINGLE Uvicorn worker (see DEPLOY.md): there is no
# concurrent migrator to race. If you ever scale to multiple instances, move
# `alembic upgrade head` to a release / pre-deploy step instead.
#
# `alembic upgrade head` reads its URL from src.core.config.settings, so it needs
# DATABASE_URL, JWT_SECRET_KEY, and CORS_ORIGINS present in the environment — the
# same required vars the app itself needs.
set -e

echo "[entrypoint] Applying migrations: alembic upgrade head"
alembic upgrade head

echo "[entrypoint] Starting LISTn API on 0.0.0.0:${PORT:-8000}"
# Single Uvicorn worker on purpose: the slowapi rate limiter is in-memory, so
# multiple workers (or instances) would each keep separate counters and split
# the limits. `exec` makes Uvicorn PID 1 so it receives SIGTERM for clean stops.
#
# --forwarded-allow-ips: the container only ever sits behind Railway's proxy, so
# every request arrives from the proxy's IP. Trusting X-Forwarded-For lets the
# per-IP rate limiter see each client's real IP instead of lumping all users
# into one shared bucket. "*" is safe only because nothing can reach this
# container directly; set FORWARDED_ALLOW_IPS to the proxy's IPs if that changes.
exec uvicorn main:app --host 0.0.0.0 --port "${PORT:-8000}" \
    --proxy-headers --forwarded-allow-ips "${FORWARDED_ALLOW_IPS:-*}"
