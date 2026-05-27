from __future__ import annotations

import datetime as dt

from fastapi import APIRouter, Query

from brain.decision_engine import make_decision
from brain.fakeout_detector import detect_fakeout
from brain.squeeze_detector import detect_squeeze
from brain.trap_detector import detect_trap
from data import market_data
from engines.absorption_engine import detect_absorption
from engines.cvd_engine import cvd_from_trades
from engines.delta_engine import analyze_delta
from engines.exchange_confirmation import analyze_exchange_confirmation
from engines.funding_engine import analyze_funding
from engines.liquidation_engine import analyze_coinglass_liquidation
from engines.liquidity_map import build_liquidity_map
from engines.micro_scalp_engine import detect_micro_scalp
from engines.oi_engine import analyze_oi
from engines.orderbook_imbalance import analyze_orderbook_imbalance
from risk.entry_engine import build_entry_plan

from .analytics import (
    action_to_signal,
    ai_summary_text,
    base_asset,
    calculate_atr,
    calculate_volatility,
    candle_trend,
    normalize_symbol,
    support_resistance,
    to_float,
)
from .cache import TTLCache

router = APIRouter(prefix="/api", tags=["market"])
cache = TTLCache()


def _market_cap_hint(symbol: str) -> dict:
    base = base_asset(symbol)
    if base in {"BTC", "ETH", "BNB", "SOL", "XRP", "DOGE"}:
        return {"value": None, "status": "Not connected yet", "note": "Market cap source optional"}
    return {"value": None, "status": "Coming soon", "note": "Unknown asset mapping"}


def _long_short_bias(delta_pct: float, funding_state: str) -> str:
    if delta_pct > 12 and "positive" in funding_state:
        return "Long crowd active"
    if delta_pct < -12 and "negative" in funding_state:
        return "Short crowd active"
    if delta_pct > 8:
        return "Buy-side pressure"
    if delta_pct < -8:
        return "Sell-side pressure"
    return "Balanced"


def _sanitize_exchange_snapshot(payload: dict | None) -> dict:
    if not isinstance(payload, dict):
        return {"ok": False, "message": "Not connected yet"}
    clean = dict(payload)
    candles = clean.get("candles")
    if hasattr(candles, "tail") and hasattr(candles, "to_dict"):
        try:
            clean["candles"] = candles.tail(30).to_dict(orient="records")
        except Exception:
            clean["candles"] = []
    return clean


def _fallback_response(pair: str, reason: str) -> dict:
    return {
        "ok": True,
        "symbol": pair,
        "timestamp": dt.datetime.utcnow().isoformat() + "Z",
        "paper_trading_only": True,
        "terminal_signal": "WAIT",
        "summary": {
            "price": 0.0,
            "change_24h_pct": 0.0,
            "volume_24h": 0.0,
            "market_cap": _market_cap_hint(pair),
            "funding_rate": 0.0,
            "open_interest": 0.0,
            "long_short_bias": "Not connected yet",
            "liquidation_state": "Not connected yet",
            "volatility_pct": 0.0,
            "atr": 0.0,
            "candle_trend": {"trend": "UNKNOWN", "close": 0.0, "sma20": 0.0, "sma50": 0.0, "bias_score": 0},
            "support_resistance": {"support": [], "resistance": []},
        },
        "binance": {
            "spot": {},
            "futures_24h": {},
            "orderbook": {"top_bids": [], "top_asks": [], "imbalance": {}},
            "recent_trades": [],
            "funding": [],
            "open_interest": {},
            "premium": {},
        },
        "bybit": {"ok": False, "message": "Not connected yet"},
        "analysis": {
            "decision": {"action": "WAIT_DATA_WEAK", "trade_bias": "NO_TRADE", "probability": 0},
            "entry": {"entry_zone": "NO_ENTRY", "invalidation": "NO_TRADE", "targets": []},
            "parts": {"error": reason[:200]},
            "ai_summary": "Data source temporarily unavailable. WAIT and retry. Paper mode remains active.",
        },
        "sources": {
            "bookmap": {"status": "API key required", "ready": True},
            "exocharts": {"status": "Coming soon", "ready": True},
            "tradinglite": {"status": "Coming soon", "ready": True},
            "cryptoquant": {"status": "API key required", "ready": True},
            "glassnode": {"status": "API key required", "ready": True},
            "arkham": {"status": "API key required", "ready": True},
            "whale_alert": {"status": "API key required", "ready": True},
            "coinglass": {"status": "Not connected yet"},
            "okx_orderbook": {"status": "Coming soon", "ready": True},
            "velo": {"status": "API key required", "ready": True},
            "hyblock": {"status": "API key required", "ready": True},
            "tradingview": {"status": "Connected", "symbol": f"BINANCE:{pair}"},
        },
        "warning": "Live market sources are unavailable from current environment.",
    }


@router.get("/search")
def search_coin(symbol: str = Query("BTCUSDT", min_length=2)) -> dict:
    pair = normalize_symbol(symbol)

    def _fetch():
        try:
            snapshot = market_data.get_snapshot(pair, "5m", 160)
            candles = snapshot.candles
            orderbook = snapshot.orderbook if isinstance(snapshot.orderbook, dict) else {}
            trades = snapshot.trades if isinstance(snapshot.trades, list) else []
        except Exception as exc:
            return _fallback_response(pair, str(exc))

        delta = analyze_delta(trades)
        cvd = cvd_from_trades(trades)
        liquidity = build_liquidity_map(candles)
        ob_imbalance = analyze_orderbook_imbalance(orderbook)
        absorption = detect_absorption(candles, delta)
        fakeout = detect_fakeout(candles)
        squeeze = detect_squeeze(candles, snapshot.funding)
        funding = analyze_funding(snapshot.funding)
        oi = analyze_oi(snapshot)
        exchange_confirmation = analyze_exchange_confirmation(snapshot)
        liquidation = analyze_coinglass_liquidation(pair, to_float(snapshot.futures_24h.get("lastPrice")))

        parts = {
            "liquidity": liquidity,
            "orderbook_imbalance": ob_imbalance,
            "delta": delta,
            "cvd": cvd,
            "absorption": absorption,
            "fakeout": fakeout,
            "squeeze": squeeze,
            "funding": funding,
            "oi": oi,
            "liquidation": liquidation,
            "exchange_confirmation": exchange_confirmation,
        }

        trap = detect_trap(parts)
        micro = detect_micro_scalp(parts)
        decision = make_decision(trap, exchange_confirmation, micro)
        entry = build_entry_plan(candles, decision, liquidity)

        atr = calculate_atr(candles)
        vol = calculate_volatility(candles)
        trend = candle_trend(candles)
        sr = support_resistance(candles)

        price = to_float(snapshot.futures_24h.get("lastPrice") or snapshot.spot.get("price"))
        change_24h = to_float(snapshot.futures_24h.get("priceChangePercent"))
        volume_24h = to_float(snapshot.futures_24h.get("volume"))

        response = {
            "ok": True,
            "symbol": pair,
            "timestamp": dt.datetime.utcnow().isoformat() + "Z",
            "paper_trading_only": True,
            "terminal_signal": action_to_signal(decision.get("action", "WAIT"), decision.get("trade_bias", "NO_TRADE")),
            "summary": {
                "price": round(price, 6),
                "change_24h_pct": round(change_24h, 4),
                "volume_24h": round(volume_24h, 4),
                "market_cap": _market_cap_hint(pair),
                "funding_rate": round(to_float(funding.get("rate")), 8),
                "open_interest": round(to_float(oi.get("open_interest")), 4),
                "long_short_bias": _long_short_bias(float(delta.get("delta_pct", 0)), str(funding.get("state", "neutral"))),
                "liquidation_state": liquidation.get("state", "Not connected yet"),
                "volatility_pct": round(vol, 4),
                "atr": round(atr, 6),
                "candle_trend": trend,
                "support_resistance": sr,
            },
            "binance": {
                "spot": snapshot.spot,
                "futures_24h": snapshot.futures_24h,
                "orderbook": {
                    "top_bids": (orderbook.get("bids") or [])[:15],
                    "top_asks": (orderbook.get("asks") or [])[:15],
                    "imbalance": ob_imbalance,
                },
                "recent_trades": trades[-80:],
                "funding": snapshot.funding,
                "open_interest": snapshot.open_interest,
                "premium": snapshot.premium,
            },
            "bybit": _sanitize_exchange_snapshot(snapshot.exchanges.get("bybit", {"ok": False, "message": "Not connected yet"})),
            "analysis": {
                "decision": decision,
                "entry": entry,
                "parts": parts,
                "ai_summary": ai_summary_text(pair, trend, decision, funding.get("state", "neutral"), vol),
            },
            "sources": {
                "bookmap": {"status": "API key required", "ready": True},
                "exocharts": {"status": "Coming soon", "ready": True},
                "tradinglite": {"status": "Coming soon", "ready": True},
                "cryptoquant": {"status": "API key required", "ready": True},
                "glassnode": {"status": "API key required", "ready": True},
                "arkham": {"status": "API key required", "ready": True},
                "whale_alert": {"status": "API key required", "ready": True},
                "coinglass": {
                    "status": "Connected" if liquidation.get("state") not in {"disabled", "missing_key", "coinglass_error"} else "Not connected yet",
                    "details": liquidation,
                },
                "okx_orderbook": {"status": "Coming soon", "ready": True},
                "velo": {"status": "API key required", "ready": True},
                "hyblock": {"status": "API key required", "ready": True},
                "tradingview": {"status": "Connected", "symbol": f"BINANCE:{pair}"},
            },
        }
        return response

    return cache.get_or_set(f"search:{pair}", 10, _fetch)


@router.get("/market/live")
def market_live(symbol: str = Query("BTCUSDT")) -> dict:
    data = search_coin(symbol)
    return {
        "ok": data.get("ok", False),
        "symbol": data.get("symbol"),
        "timestamp": data.get("timestamp"),
        "price": data.get("summary", {}).get("price"),
        "change_24h_pct": data.get("summary", {}).get("change_24h_pct"),
        "volume_24h": data.get("summary", {}).get("volume_24h"),
        "funding_rate": data.get("summary", {}).get("funding_rate"),
        "open_interest": data.get("summary", {}).get("open_interest"),
        "volatility_pct": data.get("summary", {}).get("volatility_pct"),
        "signal": data.get("terminal_signal", "WAIT"),
    }
