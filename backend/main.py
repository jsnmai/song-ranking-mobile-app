from fastapi import FastAPI

from src.routers import auth

app = FastAPI(title="LISTn API")

app.include_router(auth.router, prefix="/api/v1")


@app.get("/api/v1/health")
def health():
    """Returns 200 if the server is running."""
    return {"status": "ok"}               