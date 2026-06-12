from __future__ import annotations

import math
import time
from statistics import mean, pstdev
from typing import Any

import requests
from fastapi import APIRouter, Query

from .cache import TTLCache

router = APIRouter(prefix="/api/binance", tags=["binance"])
search_router = APIRouter(prefix="/api", tags=["coin-intel"])
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


def _owner_link(symbol: str) -> str:
    return f"https://www.binance.com/en/futures/{symbol}"


def _tickers_all() -> list[dict[str, Any]]:
    data = _safe_json(f"{FAPI}/fapi/v1/ticker/24hr")
    if not isinstance(data, list):
        return []
    rows = [x for x in data if str(x.get("symbol", "")).endswith("USDT")]
    rows.sort(key=lambda r: _to_float(r.get("quoteVolume")), reverse=True)
    return rows


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


def _long_short_ratio(symbol: str) -> dict[str, Any]:
    data = _safe_json(
        f"{FAPI}/futures/data/globalLongShortAccountRatio",
        {"symbol": symbol, "period": "5m", "limit": 1},
    )
    if isinstance(data, list) and data:
        row = data[-1]
        return {
            "long_account": _to_float(row.get("longAccount")),
            "short_account": _to_float(row.get("shortAccount")),
            "ratio": _to_float(row.get("longShortRatio")),
        }
    return {
        "long_account": 0.0,
        "short_account": 0.0,
        "ratio": 0.0,
        "status": "Not connected yet",
    }


def _fetch_orderbook(symbol: str, limit: int = 20) -> dict[str, Any]:
    data = _safe_json(f"{FAPI}/fapi/v1/depth", {"symbol": symbol, "limit": limit}) or {}
    bids = data.get("bids") or []
    asks = data.get("asks") or []
    bid_notional = sum(_to_float(x[0]) * _to_float(x[1]) for x in bids[:limit] if isinstance(x, list) and len(x) >= 2)
    ask_notional = sum(_to_float(x[0]) * _to_float(x[1]) for x in asks[:limit] if isinstance(x, list) and len(x) >= 2)
    total = bid_notional + ask_notional
    imbalance = (bid_notional - ask_notional) / total if total > 0 else 0.0
    return {
        "bids": bids[:limit],
        "asks": asks[:limit],
        "pressure": {
            "bid_notional": round(bid_notional, 2),
            "ask_notional": round(ask_notional, 2),
            "imbalance": round(imbalance, 5),
        },
    }


def _fetch_trades(symbol: str, limit: int = 80) -> dict[str, Any]:
    data = _safe_json(f"{FAPI}/fapi/v1/trades", {"symbol": symbol, "limit": limit}) or []
    rows: list[dict[str, Any]] = []
    delta_notional = 0.0
    total_notional = 0.0

    for x in data[-limit:]:
        px = _to_float(x.get("price"))
        qty = _to_float(x.get("qty"))
        notional = px * qty
        side = "SELL" if x.get("isBuyerMaker") else "BUY"
        signed = -notional if side == "SELL" else notional
        total_notional += notional
        delta_notional += signed
        rows.append(
            {
                "price": px,
                "qty": qty,
                "notional": round(notional, 2),
                "time": x.get("time"),
                "side": side,
            }
        )
    delta_pct = (delta_notional / total_notional * 100.0) if total_notional > 0 else 0.0
    return {
        "rows": rows,
        "delta": {
            "delta_notional": round(delta_notional, 2),
            "delta_pct": round(delta_pct, 3),
            "total_notional": round(total_notional, 2),
        },
    }


def _fetch_klines(symbol: str, interval: str = "5m", limit: int = 160) -> dict[str, Any]:
    data = _safe_json(f"{FAPI}/fapi/v1/klines", {"symbol": symbol, "interval": interval, "limit": limit}) or []
    highs: list[float] = []
    lows: list[float] = []
    closes: list[float] = []

    for row in data:
        if not isinstance(row, list) or len(row) < 5:
            continue
        highs.append(_to_float(row[2]))
        lows.append(_to_float(row[3]))
        closes.append(_to_float(row[4]))

    if len(closes) < 20:
        return {
            "atr": 0.0,
            "volatility_pct": 0.0,
            "trend": "UNKNOWN",
            "support": [],
            "resistance": [],
            "close": closes[-1] if closes else 0.0,
            "candles": [],
        }

    returns = []
    for i in range(1, len(closes)):
        prev = closes[i - 1]
        cur = closes[i]
        if prev > 0:
            returns.append((cur - prev) / prev)
    vol = pstdev(returns[-30:]) * math.sqrt(min(30, len(returns))) * 100 if len(returns) > 1 else 0.0

    trs = []
    for i in range(1, len(closes)):
        h = highs[i]
        l = lows[i]
        pc = closes[i - 1]
        tr = max(h - l, abs(h - pc), abs(l - pc))
        trs.append(tr)
    atr = mean(trs[-14:]) if trs else 0.0

    sma20 = mean(closes[-20:])
    sma50 = mean(closes[-50:]) if len(closes) >= 50 else mean(closes)
    if closes[-1] > sma20 > sma50:
        trend = "BULLISH"
    elif closes[-1] < sma20 < sma50:
        trend = "BEARISH"
    else:
        trend = "SIDEWAYS"

    support = sorted(set(round(x, 6) for x in sorted(lows[-60:])[:4]))
    resistance = sorted(set(round(x, 6) for x in sorted(highs[-60:], reverse=True)[:4]))
    resistance = sorted(resistance)

    return {
        "atr": round(atr, 6),
        "volatility_pct": round(vol, 4),
        "trend": trend,
        "support": support,
        "resistance": resistance,
        "close": round(closes[-1], 6),
        "candles": data[-60:],
    }


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


def _trap_read(imbalance: float, delta_pct: float, funding: float) -> dict[str, Any]:
    pressure_value = (imbalance * 100.0) + (delta_pct * 0.8) + (funding * 80000.0)
    if pressure_value > 6.0:
        pressure = "LONG_PRESSURE"
    elif pressure_value < -6.0:
        pressure = "SHORT_PRESSURE"
    else:
        pressure = "NEUTRAL"

    if pressure == "LONG_PRESSURE" and funding <= 0:
        hunt = "LIQUIDITY_HUNT_UP"
    elif pressure == "SHORT_PRESSURE" and funding >= 0:
        hunt = "LIQUIDITY_HUNT_DOWN"
    else:
        hunt = "WAIT"

    confidence = min(99, max(15, int(abs(pressure_value) * 4.5)))
    summary = (
        "Buy-side depth and trade delta dominate."
        if pressure == "LONG_PRESSURE"
        else "Sell-side depth and trade delta dominate."
        if pressure == "SHORT_PRESSURE"
        else "Orderbook and trade flow are mixed."
    )
    return {
        "pressure": pressure,
        "hunt": hunt,
        "confidence": confidence,
        "explanation": summary,
    }


def _build_coin_search(symbol: str) -> dict[str, Any]:
    pair = _symbol(symbol)
    ticker = _safe_json(f"{FAPI}/fapi/v1/ticker/24hr", {"symbol": pair}) or {}
    spot = _safe_json(f"{SPOT}/api/v3/ticker/price", {"symbol": pair}) or {}
    funding = _funding_rate(pair)
    oi = _open_interest(pair)
    lsr = _long_short_ratio(pair)
    ob = _fetch_orderbook(pair, 20)
    tr = _fetch_trades(pair, 80)
    kl = _fetch_klines(pair, "5m", 160)

    price = _to_float(ticker.get("lastPrice") or spot.get("price"))
    change = _to_float(ticker.get("priceChangePercent"))
    volume = _to_float(ticker.get("quoteVolume"))

    trap = _trap_read(
        _to_float(ob.get("pressure", {}).get("imbalance")),
        _to_float(tr.get("delta", {}).get("delta_pct")),
        funding,
    )
    decision = "BUY" if trap["pressure"] == "LONG_PRESSURE" else "SELL" if trap["pressure"] == "SHORT_PRESSURE" else "WAIT"

    return {
        "ok": True,
        "symbol": pair,
        "paper_trading_only": True,
        "real_trading_disabled": True,
        "summary": {
            "price": round(price, 6),
            "spot_price": round(_to_float(spot.get("price")), 6),
            "change_24h_pct": round(change, 4),
            "volume_24h_usdt": round(volume, 2),
            "market_cap": {"value": None, "status": "Not connected yet"},
            "funding_rate": round(funding, 8),
            "open_interest": round(oi, 3),
            "long_short_ratio": lsr,
            "long_short_bias": _bias_label(change, funding),
            "liquidation_data": "Not connected yet",
            "volatility_pct": kl["volatility_pct"],
            "atr": kl["atr"],
            "candle_trend": kl["trend"],
            "support_resistance": {
                "support": kl["support"],
                "resistance": kl["resistance"],
            },
            "trap_score": _trap_score(change, volume, funding),
            "trap_bias": _bias_label(change, funding),
            "source_link": _owner_link(pair),
        },
        "orderbook": ob,
        "recent_trades": tr,
        "analysis": {
            "pressure": trap["pressure"],
            "hunt_signal": trap["hunt"],
            "confidence": trap["confidence"],
            "decision": decision,
            "ai_summary": (
                f"{pair}: {decision} bias, {trap['pressure']} and {trap['hunt']}. "
                f"Confidence {trap['confidence']}%. {trap['explanation']} Paper mode only."
            ),
        },
        "tradingview": {"symbol": f"BINANCE:{pair}", "status": "Connected"},
        "source_link": _owner_link(pair),
        "updated_at": int(time.time()),
    }


@router.get("/price")
def price(symbol: str = Query("BTCUSDT")) -> dict[str, Any]:
    pair = _symbol(symbol)

    def _fetch():
        tick = _safe_json(f"{FAPI}/fapi/v1/ticker/price", {"symbol": pair}) or {}
        return {
            "ok": bool(tick),
            "symbol": pair,
            "price": _to_float(tick.get("price")),
            "source_link": _owner_link(pair),
            "updated_at": int(time.time()),
        }

    return cache.get_or_set(f"bn:price:{pair}", 4, _fetch)


@router.get("/summary")
def summary(symbol: str = Query("BTCUSDT")) -> dict[str, Any]:
    pair = _symbol(symbol)

    def _fetch():
        payload = _build_coin_search(pair)
        return {
            "ok": payload["ok"],
            "symbol": payload["symbol"],
            "last_price": payload["summary"]["price"],
            "spot_price": payload["summary"]["spot_price"],
            "change_24h_pct": payload["summary"]["change_24h_pct"],
            "volume_24h_usdt": payload["summary"]["volume_24h_usdt"],
            "funding_rate": payload["summary"]["funding_rate"],
            "open_interest": payload["summary"]["open_interest"],
            "trap_score": payload["summary"]["trap_score"],
            "trap_bias": payload["summary"]["trap_bias"],
            "source_link": payload["summary"]["source_link"],
            "real_trading_disabled": True,
            "ts": int(time.time()),
        }

    return cache.get_or_set(f"bn:summary:{pair}", 8, _fetch)


@router.get("/orderbook")
def orderbook(symbol: str = Query("BTCUSDT"), limit: int = Query(20, ge=5, le=100)) -> dict[str, Any]:
    pair = _symbol(symbol)

    def _fetch():
        ob = _fetch_orderbook(pair, limit)
        return {
            "ok": bool(ob.get("bids") or ob.get("asks")),
            "symbol": pair,
            "bids": ob["bids"],
            "asks": ob["asks"],
            "pressure": ob["pressure"],
            "source_link": _owner_link(pair),
        }

    return cache.get_or_set(f"bn:ob:{pair}:{limit}", 4, _fetch)


@router.get("/trades")
def trades(symbol: str = Query("BTCUSDT"), limit: int = Query(40, ge=10, le=120)) -> dict[str, Any]:
    pair = _symbol(symbol)

    def _fetch():
        tr = _fetch_trades(pair, limit)
        return {
            "ok": True,
            "symbol": pair,
            "trades": tr["rows"],
            "delta": tr["delta"],
            "source_link": _owner_link(pair),
        }

    return cache.get_or_set(f"bn:tr:{pair}:{limit}", 4, _fetch)


@router.get("/futures")
def futures(symbol: str = Query("BTCUSDT")) -> dict[str, Any]:
    pair = _symbol(symbol)

    def _fetch():
        ticker = _safe_json(f"{FAPI}/fapi/v1/ticker/24hr", {"symbol": pair}) or {}
        ob = _fetch_orderbook(pair, 20)
        tr = _fetch_trades(pair, 60)
        kl = _fetch_klines(pair, "5m", 120)
        funding = _funding_rate(pair)
        oi = _open_interest(pair)
        lsr = _long_short_ratio(pair)
        return {
            "ok": True,
            "symbol": pair,
            "ticker_24h": ticker,
            "funding_rate": funding,
            "open_interest": oi,
            "long_short_ratio": lsr,
            "orderbook": ob,
            "trades": tr,
            "volatility_pct": kl["volatility_pct"],
            "atr": kl["atr"],
            "trend": kl["trend"],
            "source_link": _owner_link(pair),
        }

    return cache.get_or_set(f"bn:fut:{pair}", 6, _fetch)


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
        long_pressure_pct = round(long_heavy / max(1, len(tickers)) * 100.0, 2)
        short_pressure_pct = round(short_heavy / max(1, len(tickers)) * 100.0, 2)
        return {
            "ok": True,
            "bias": bias,
            "long_heavy_count": long_heavy,
            "short_heavy_count": short_heavy,
            "squeeze_risk_count": squeeze_risk,
            "long_pressure_pct": long_pressure_pct,
            "short_pressure_pct": short_pressure_pct,
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
        for sym in WATCHLIST[:8]:
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


@search_router.get("/search")
def search(symbol: str = Query("BTCUSDT")) -> dict[str, Any]:
    pair = _symbol(symbol)

    def _fetch():
        return _build_coin_search(pair)

    return cache.get_or_set(f"bn:search:{pair}", 8, _fetch)
