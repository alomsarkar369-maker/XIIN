from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import FastAPI, Query
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from web.api.binance import router as binance_router
from web.api.binance import search_router
from web.api.bot_status import router as bot_router
from web.api.bybit_liquidations import router as bybit_liq_router
from web.api.dexscreener import router as dexscreener_router
from web.api.news import router as news_router
from web.api.sources import router as sources_router

BASE_DIR = Path(__file__).resolve().parent
STATIC_DIR = BASE_DIR / "static"
INDEX_FILE = STATIC_DIR / "index.html"

app = FastAPI(
    title="LIQTRAP Web Terminal",
    version="3.0.0",
    docs_url="/docs",
    redoc_url="/redoc",
)

app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")

app.include_router(binance_router)
app.include_router(search_router)
app.include_router(bybit_liq_router)
app.include_router(dexscreener_router)
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


@app.get("/coin", include_in_schema=False)
def coin_page() -> FileResponse:
    return _serve_index()


@app.get("/market", include_in_schema=False)
def market_page() -> FileResponse:
    return _serve_index()


@app.get("/liquidations", include_in_schema=False)
def liquidations_page() -> FileResponse:
    return _serve_index()


@app.get("/news", include_in_schema=False)
def news_page() -> FileResponse:
    return _serve_index()


@app.get("/sources", include_in_schema=False)
def sources_page() -> RedirectResponse:
    return RedirectResponse(url="/home", status_code=307)


@app.get("/api/liquidations/live")
def liquidations_live(limit: int = Query(30, ge=10, le=90), symbol: str = Query("BTCUSDT")) -> dict[str, Any]:
    from web.api.binance import realtime_liquidations
    from web.api.bybit_liquidations import liquidations, ticker

    bn = realtime_liquidations(min(30, limit))
    bb_symbol = liquidations(symbol, min(35, limit))
    bb_ticker = ticker(min(45, limit))

    merged = []
    for r in bn.get("rows", []):
        row = dict(r)
        row["exchange"] = "Binance"
        merged.append(row)
    for r in bb_ticker.get("rows", []):
        row = dict(r)
        row["exchange"] = "Bybit"
        merged.append(row)

    merged.sort(key=lambda x: x.get("time", 0), reverse=True)

    return {
        "ok": True,
        "symbol": symbol.upper(),
        "real_trading_disabled": True,
        "binance": bn,
        "bybit_symbol": bb_symbol,
        "bybit_ticker": bb_ticker,
        "rows": merged[:limit],
    }


@app.get("/healthz")
def healthz() -> dict[str, Any]:
    return {
        "status": "ok",
        "service": "liqtrap-web-terminal",
        "real_trading_disabled": True,
        "bot_connection": "disabled_by_design",
    }
