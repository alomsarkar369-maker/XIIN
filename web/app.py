from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from web.api.binance import router as binance_router
from web.api.bot_status import router as bot_router
from web.api.news import router as news_router
from web.api.sources import router as sources_router

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
INDEX_FILE = STATIC_DIR / "index.html"

app = FastAPI(
    title="LIQTRAP Web Terminal Demo",
    version="2.0.0-demo",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(binance_router)
app.include_router(bot_router)
app.include_router(news_router)
app.include_router(sources_router)


def _serve_index() -> FileResponse:
    return FileResponse(str(INDEX_FILE))


@app.get("/", include_in_schema=False)
def root() -> FileResponse:
    return _serve_index()


@app.get("/home", include_in_schema=False)
def home_page() -> FileResponse:
    return _serve_index()


@app.get("/market", include_in_schema=False)
def market_page() -> FileResponse:
    return _serve_index()


@app.get("/sources", include_in_schema=False)
def sources_page() -> FileResponse:
    return _serve_index()


@app.get("/healthz")
def healthz() -> dict:
    return {
        "status": "ok",
        "service": "liqtrap-web-demo",
        "real_trading_disabled": True,
        "bot_connection": "disabled_by_design",
    }
