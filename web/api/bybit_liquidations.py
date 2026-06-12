from __future__ import annotations

import time
from typing import Any

import requests
from fastapi import APIRouter, Query

from .cache import TTLCache

router = APIRouter(prefix="/api/bybit", tags=["bybit-liquidations"])
cache = TTLCache()
session = requests.Session()

REST = "https://api.bybit.com"
WATCHLIST = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "BNBUSDT",
    "ADAUSDT",
    "LINKUSDT",
]


def _to_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except Exception:
        return default


def _safe_json(url: str, params: dict | None = None, timeout: int = 8) -> Any:
    try:
        r = session.get(url, params=params or {}, timeout=timeout)
        r.raise_for_status()
        return r.json()
    except Exception:
        return None


def _symbol(raw: str | None) -> str:
    s = (raw or "BTCUSDT").upper().strip().replace("/", "").replace("-", "")
    if not s.endswith(("USDT", "USDC", "USD", "BUSD")):
        s = f"{s}USDT"
    return s


def _owner_link(symbol: str) -> str:
    return f"https://www.bybit.com/trade/usdt/{symbol}"


def _recent_trade_rows(symbol: str, limit: int = 120, min_notional: float = 15_000.0) -> list[dict[str, Any]]:
    data = _safe_json(
        f"{REST}/v5/market/recent-trade",
        {"category": "linear", "symbol": symbol, "limit": max(20, min(1000, limit))},
    )
    rows = []
    for item in ((data or {}).get("result", {}) or {}).get("list", []) or []:
        px = _to_float(item.get("p"))
        qty = _to_float(item.get("v"))
        notional = px * qty
        if notional < min_notional:
            continue
        side = str(item.get("S") or item.get("side") or "").upper()
        if side not in {"BUY", "SELL"}:
            side = "BUY"
        rows.append(
            {
                "symbol": symbol,
                "price": px,
                "qty": qty,
                "value_usdt": round(notional, 2),
                "side": side,
                "time": int(_to_float(item.get("T"))),
                "source_link": _owner_link(symbol),
            }
        )
    return rows


@router.get("/liquidations")
def liquidations(
    symbol: str = Query("BTCUSDT"),
    limit: int = Query(25, ge=8, le=60),
) -> dict[str, Any]:
    pair = _symbol(symbol)

    def _fetch():
        rows = _recent_trade_rows(pair, 180, 12_000.0)
        rows.sort(key=lambda x: x["time"], reverse=True)
        return {
            "ok": True,
            "symbol": pair,
            "mode": "bybit_public_proxy",
            "note": "Using recent large trades as liquidation pressure proxy. allLiquidation websocket can be added later.",
            "rows": rows[:limit],
            "updated_at": int(time.time()),
            "source_link": _owner_link(pair),
        }

    return cache.get_or_set(f"bybit:liq:{pair}:{limit}", 4, _fetch)


@router.get("/ticker")
def ticker(limit: int = Query(35, ge=10, le=90)) -> dict[str, Any]:
    def _fetch():
        rows = []
        for sym in WATCHLIST:
            rows.extend(_recent_trade_rows(sym, 80, 20_000.0))
        rows.sort(key=lambda x: x["time"], reverse=True)
        return {
            "ok": True,
            "mode": "bybit_public_proxy",
            "rows": rows[:limit],
            "updated_at": int(time.time()),
            "owner_link": "https://www.bybit.com/en-US/market",
        }

    return cache.get_or_set(f"bybit:ticker:{limit}", 4, _fetch)
