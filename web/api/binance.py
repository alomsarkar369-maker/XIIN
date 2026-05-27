from __future__ import annotations

import time
from typing import Any

import requests
from fastapi import APIRouter, Query

from .cache import TTLCache

router = APIRouter(prefix="/api/binance", tags=["binance"])
cache = TTLCache()
session = requests.Session()

FAPI = "https://fapi.binance.com"
SPOT = "https://api.binance.com"

WATCHLIST = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "ADAUSDT",
    "LINKUSDT",
    "AVAXUSDT",
    "SUIUSDT",
]


def _to_float(v: Any, default: float = 0.0) -> float:
    try:
        return float(v)
    except Exception:
        return default


def _symbol(raw: str | None) -> str:
    s = (raw or "BTCUSDT").upper().strip().replace("/", "").replace("-", "")
    if not s.endswith(("USDT", "USDC", "USD", "BUSD")):
        s = f"{s}USDT"
    return s


def _get_json(url: str, params: dict | None = None, timeout: int = 8) -> Any:
    r = session.get(url, params=params or {}, timeout=timeout)
    r.raise_for_status()
    return r.json()


def _safe_json(url: str, params: dict | None = None, timeout: int = 8) -> Any:
    try:
        return _get_json(url, params=params, timeout=timeout)
    except Exception:
        return None


def _tickers_all() -> list[dict[str, Any]]:
    data = _safe_json(f"{FAPI}/fapi/v1/ticker/24hr")
    if not isinstance(data, list):
        return []
    out = [x for x in data if str(x.get("symbol", "")).endswith("USDT")]
    out.sort(key=lambda r: _to_float(r.get("quoteVolume")), reverse=True)
    return out


def _funding_rate(symbol: str) -> float:
    data = _safe_json(f"{FAPI}/fapi/v1/premiumIndex", {"symbol": symbol})
    if isinstance(data, dict):
        return _to_float(data.get("lastFundingRate"))
    return 0.0


def _open_interest(symbol: str) -> float:
    data = _safe_json(f"{FAPI}/fapi/v1/openInterest", {"symbol": symbol})
    if isinstance(data, dict):
        return _to_float(data.get("openInterest"))
    return 0.0


def _trap_score(change_pct: float, quote_vol: float, funding: float) -> float:
    momentum = abs(change_pct) * 6.0
    vol_term = min(60.0, quote_vol / 1_000_000_000.0 * 11.0)
    crowd = min(20.0, abs(funding) * 10000.0)
    return round(momentum + vol_term + crowd, 2)


def _bias_label(change_pct: float, funding: float) -> str:
    if change_pct > 0 and funding > 0:
        return "Long crowd heavy"
    if change_pct < 0 and funding < 0:
        return "Short crowd heavy"
    if change_pct > 0 and funding < 0:
        return "Short squeeze risk"
    if change_pct < 0 and funding > 0:
        return "Long squeeze risk"
    return "Balanced"


def _owner_link(symbol: str) -> str:
    return f"https://www.binance.com/en/futures/{symbol}"


@router.get("/summary")
def summary(symbol: str = Query("BTCUSDT")) -> dict[str, Any]:
    pair = _symbol(symbol)

    def _fetch():
        ticker = _safe_json(f"{FAPI}/fapi/v1/ticker/24hr", {"symbol": pair}) or {}
        spot = _safe_json(f"{SPOT}/api/v3/ticker/price", {"symbol": pair}) or {}
        funding = _funding_rate(pair)
        oi = _open_interest(pair)
        change = _to_float(ticker.get("priceChangePercent"))
        quote_vol = _to_float(ticker.get("quoteVolume"))
        return {
            "ok": True,
            "symbol": pair,
            "last_price": _to_float(ticker.get("lastPrice")),
            "spot_price": _to_float(spot.get("price")),
            "change_24h_pct": change,
            "volume_24h_usdt": quote_vol,
            "funding_rate": funding,
            "open_interest": oi,
            "trap_score": _trap_score(change, quote_vol, funding),
            "trap_bias": _bias_label(change, funding),
            "source_link": _owner_link(pair),
            "real_trading_disabled": True,
            "ts": int(time.time()),
        }

    return cache.get_or_set(f"bn:summary:{pair}", 8, _fetch)


@router.get("/orderbook")
def orderbook(symbol: str = Query("BTCUSDT"), limit: int = Query(20, ge=5, le=100)) -> dict[str, Any]:
    pair = _symbol(symbol)

    def _fetch():
        data = _safe_json(f"{FAPI}/fapi/v1/depth", {"symbol": pair, "limit": limit}) or {}
        return {
            "ok": bool(data),
            "symbol": pair,
            "bids": (data.get("bids") or [])[:limit],
            "asks": (data.get("asks") or [])[:limit],
            "source_link": _owner_link(pair),
        }

    return cache.get_or_set(f"bn:ob:{pair}:{limit}", 4, _fetch)


@router.get("/trades")
def trades(symbol: str = Query("BTCUSDT"), limit: int = Query(40, ge=10, le=120)) -> dict[str, Any]:
    pair = _symbol(symbol)

    def _fetch():
        data = _safe_json(f"{FAPI}/fapi/v1/trades", {"symbol": pair, "limit": limit}) or []
        rows = []
        for x in data[-limit:]:
            px = _to_float(x.get("price"))
            qty = _to_float(x.get("qty"))
            rows.append(
                {
                    "price": px,
                    "qty": qty,
                    "notional": round(px * qty, 2),
                    "time": x.get("time"),
                    "side": "SELL" if x.get("isBuyerMaker") else "BUY",
                }
            )
        return {"ok": True, "symbol": pair, "trades": rows, "source_link": _owner_link(pair)}

    return cache.get_or_set(f"bn:tr:{pair}:{limit}", 4, _fetch)


@router.get("/market-table")
def market_table(limit: int = Query(20, ge=8, le=40)) -> dict[str, Any]:
    def _fetch():
        rows = []
        tickers = _tickers_all()[: max(limit, 10)]
        for t in tickers[:limit]:
            symbol = str(t.get("symbol") or "")
            change = _to_float(t.get("priceChangePercent"))
            quote_vol = _to_float(t.get("quoteVolume"))
            funding = _funding_rate(symbol)
            rows.append(
                {
                    "symbol": symbol,
                    "price": _to_float(t.get("lastPrice")),
                    "change_24h_pct": change,
                    "volume_24h_usdt": quote_vol,
                    "funding_rate": funding,
                    "trap_score": _trap_score(change, quote_vol, funding),
                    "trap_bias": _bias_label(change, funding),
                    "source_link": _owner_link(symbol),
                }
            )
        return {"ok": True, "rows": rows, "updated_at": int(time.time())}

    return cache.get_or_set(f"bn:mkt:{limit}", 10, _fetch)


@router.get("/trap-pulse")
def trap_pulse() -> dict[str, Any]:
    def _fetch():
        tickers = _tickers_all()[:25]
        long_heavy = 0
        short_heavy = 0
        squeeze_risk = 0
        total_score = 0.0
        for t in tickers:
            symbol = str(t.get("symbol") or "")
            change = _to_float(t.get("priceChangePercent"))
            funding = _funding_rate(symbol)
            quote_vol = _to_float(t.get("quoteVolume"))
            score = _trap_score(change, quote_vol, funding)
            total_score += score
            label = _bias_label(change, funding)
            if label == "Long crowd heavy":
                long_heavy += 1
            elif label == "Short crowd heavy":
                short_heavy += 1
            else:
                squeeze_risk += 1
        bias = "Long pressure" if long_heavy > short_heavy else "Short pressure" if short_heavy > long_heavy else "Balanced"
        return {
            "ok": True,
            "bias": bias,
            "long_heavy_count": long_heavy,
            "short_heavy_count": short_heavy,
            "squeeze_risk_count": squeeze_risk,
            "avg_trap_score": round(total_score / max(1, len(tickers)), 2),
            "line_text": f"{bias} | Long:{long_heavy} Short:{short_heavy} SqueezeRisk:{squeeze_risk}",
        }

    return cache.get_or_set("bn:pulse", 10, _fetch)


@router.get("/heatmap")
def heatmap(window: str = Query("4h"), limit: int = Query(10, ge=6, le=12)) -> dict[str, Any]:
    window = window if window in {"1h", "4h", "12h", "24h"} else "4h"

    def _fetch():
        top = []
        for t in _tickers_all()[:30]:
            symbol = str(t.get("symbol") or "")
            change = _to_float(t.get("priceChangePercent"))
            quote_vol = _to_float(t.get("quoteVolume"))
            funding = _funding_rate(symbol)
            score = _trap_score(change, quote_vol, funding)
            if window == "1h":
                score *= 0.72
            elif window == "12h":
                score *= 1.08
            elif window == "24h":
                score *= 1.2
            top.append(
                {
                    "symbol": symbol,
                    "score": round(score, 2),
                    "change_24h_pct": change,
                    "direction": "up" if change >= 0 else "down",
                    "trap_bias": _bias_label(change, funding),
                    "source_link": _owner_link(symbol),
                }
            )
        top.sort(key=lambda x: x["score"], reverse=True)
        return {"ok": True, "window": window, "coins": top[:limit]}

    return cache.get_or_set(f"bn:heat:{window}:{limit}", 10, _fetch)


@router.get("/realtime-liquidations")
def realtime_liquidations(limit: int = Query(20, ge=10, le=30)) -> dict[str, Any]:
    def _fetch():
        rows = []
        symbols = WATCHLIST[:8]
        for sym in symbols:
            trades_data = _safe_json(f"{FAPI}/fapi/v1/trades", {"symbol": sym, "limit": 25}) or []
            for t in trades_data[-8:]:
                px = _to_float(t.get("price"))
                qty = _to_float(t.get("qty"))
                notional = px * qty
                if notional < 15_000:
                    continue
                rows.append(
                    {
                        "symbol": sym,
                        "price": px,
                        "value_usdt": round(notional, 2),
                        "time": t.get("time"),
                        "side": "SELL" if t.get("isBuyerMaker") else "BUY",
                        "source_link": _owner_link(sym),
                    }
                )
        rows.sort(key=lambda x: x.get("time") or 0, reverse=True)
        return {
            "ok": True,
            "mode": "proxy_from_large_recent_trades",
            "rows": rows[:limit],
        }

    return cache.get_or_set(f"bn:liq:{limit}", 6, _fetch)


@router.get("/home")
def home_data(symbol: str = Query("BTCUSDT")) -> dict[str, Any]:
    pair = _symbol(symbol)
    return {
        "ok": True,
        "summary": summary(pair),
        "pulse": trap_pulse(),
        "heatmap_1h": heatmap("1h", 10),
        "heatmap_4h": heatmap("4h", 10),
        "heatmap_12h": heatmap("12h", 10),
        "heatmap_24h": heatmap("24h", 10),
        "liquidations": realtime_liquidations(20),
        "market": market_table(18),
    }
