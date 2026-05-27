from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Query

from data import bybit_client as bybit

from .analytics import normalize_symbol
from .cache import TTLCache

router = APIRouter(prefix="/api/bybit", tags=["bybit"])
cache = TTLCache()


def _safe_call(fn, *args, **kwargs):
    try:
        return {"ok": True, "data": fn(*args, **kwargs)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)[:220], "data": None}


@router.get("/orderbook")
def get_orderbook(symbol: str = Query("BTCUSDT", min_length=2)) -> dict[str, Any]:
    pair = normalize_symbol(symbol)

    def _fetch():
        payload = _safe_call(bybit.orderbook, pair, 50)
        payload["symbol"] = pair
        return payload

    return cache.get_or_set(f"bybit:orderbook:{pair}", 6, _fetch)


@router.get("/futures")
def get_futures(symbol: str = Query("BTCUSDT", min_length=2)) -> dict[str, Any]:
    pair = normalize_symbol(symbol)

    def _fetch():
        snap = bybit.collect_snapshot(pair, "5m", 120)
        if not snap.get("ok"):
            return {
                "symbol": pair,
                "ok": False,
                "error": str(snap.get("error", "Bybit unavailable"))[:220],
            }
        return {
            "symbol": pair,
            "ok": True,
            "ticker": snap.get("ticker", {}),
            "funding": snap.get("funding", []),
            "open_interest": snap.get("open_interest", []),
            "trades": (snap.get("trades", []) or [])[:120],
            "orderbook": snap.get("orderbook", {}),
        }

    return cache.get_or_set(f"bybit:futures:{pair}", 6, _fetch)
