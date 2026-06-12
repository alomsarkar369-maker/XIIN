from __future__ import annotations

import time
from typing import Any

import requests
from fastapi import APIRouter, Query

from .cache import TTLCache

router = APIRouter(prefix="/api/dexscreener", tags=["dexscreener"])
cache = TTLCache()
session = requests.Session()

BASE = "https://api.dexscreener.com"
TREND_QUERY = "BTC ETH SOL XRP DOGE PEPE WIF BONK SUI BNB"


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


def _pair_row(p: dict[str, Any]) -> dict[str, Any]:
    base = (p.get("baseToken") or {}).get("symbol") or "N/A"
    quote = (p.get("quoteToken") or {}).get("symbol") or "N/A"
    return {
        "symbol": f"{base}/{quote}",
        "price_usd": _to_float(p.get("priceUsd")),
        "liquidity_usd": _to_float((p.get("liquidity") or {}).get("usd")),
        "volume_24h": _to_float((p.get("volume") or {}).get("h24")),
        "price_change_24h_pct": _to_float((p.get("priceChange") or {}).get("h24")),
        "dex": p.get("dexId") or "N/A",
        "chain": p.get("chainId") or "N/A",
        "pair_url": p.get("url") or "https://dexscreener.com/",
        "pair_address": p.get("pairAddress") or "",
    }


@router.get("/search")
def search(query: str = Query("BTC")) -> dict[str, Any]:
    q = (query or "BTC").strip()

    def _fetch():
        data = _safe_json(f"{BASE}/latest/dex/search", {"q": q}) or {}
        pairs = data.get("pairs") or []
        rows = [_pair_row(x) for x in pairs[:30]]
        return {
            "ok": True,
            "query": q,
            "rows": rows,
            "updated_at": int(time.time()),
            "source_link": f"https://dexscreener.com/search?q={q}",
        }

    return cache.get_or_set(f"dex:search:{q}", 12, _fetch)


@router.get("/trending")
def trending(limit: int = Query(12, ge=6, le=24)) -> dict[str, Any]:
    def _fetch():
        data = _safe_json(f"{BASE}/latest/dex/search", {"q": TREND_QUERY}) or {}
        pairs = data.get("pairs") or []
        rows = [_pair_row(x) for x in pairs]
        rows.sort(key=lambda x: x["volume_24h"], reverse=True)
        return {
            "ok": True,
            "rows": rows[:limit],
            "updated_at": int(time.time()),
            "source_link": "https://dexscreener.com/",
            "note": "Public trend clue from DexScreener search API",
        }

    return cache.get_or_set(f"dex:trend:{limit}", 15, _fetch)
