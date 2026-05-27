from __future__ import annotations

import math
from typing import Any

import pandas as pd

ACTION_TO_SIGNAL = {
    "HIGH_CONFIDENCE": "BUY",
    "STRONG_SETUP": "BUY",
    "PREPARE_TRAP": "WAIT",
    "MICRO_SCALP": "BUY",
    "PROBE_SMALL": "WAIT",
    "WATCH": "WAIT",
    "WAIT_DATA_WEAK": "WAIT",
    "WAIT_CONFLICT_HIGH": "WAIT",
    "NO_TRADE": "WAIT",
}


def normalize_symbol(raw: str | None) -> str:
    symbol = (raw or "BTCUSDT").upper().strip().replace("/", "").replace("-", "")
    if not symbol:
        symbol = "BTCUSDT"
    if symbol.endswith("PERP"):
        symbol = symbol[:-4]
    quote_candidates = ("USDT", "USDC", "USD", "BUSD")
    if not any(symbol.endswith(q) for q in quote_candidates):
        symbol = f"{symbol}USDT"
    return symbol


def base_asset(symbol: str) -> str:
    clean = normalize_symbol(symbol)
    for quote in ("USDT", "USDC", "BUSD", "USD"):
        if clean.endswith(quote):
            return clean[: -len(quote)]
    return clean


def to_float(value: Any, default: float = 0.0) -> float:
    try:
        return float(value)
    except Exception:
        return default


def safe_round(value: Any, digits: int = 4, default: float = 0.0) -> float:
    return round(to_float(value, default), digits)


def calculate_atr(df: pd.DataFrame, period: int = 14) -> float:
    if df is None or df.empty:
        return 0.0
    d = df.tail(max(period + 2, 20)).copy()
    high = d["high"].astype(float)
    low = d["low"].astype(float)
    close = d["close"].astype(float)
    prev_close = close.shift(1)
    tr = pd.concat([(high - low), (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    atr = tr.rolling(period).mean().iloc[-1]
    if pd.isna(atr):
        atr = tr.mean()
    return float(atr or 0.0)


def calculate_volatility(df: pd.DataFrame, window: int = 20) -> float:
    if df is None or len(df) < max(window, 5):
        return 0.0
    close = df["close"].astype(float)
    returns = close.pct_change().dropna()
    if returns.empty:
        return 0.0
    windowed = returns.tail(window)
    return float(windowed.std() * math.sqrt(max(1, len(windowed))) * 100)


def candle_trend(df: pd.DataFrame) -> dict[str, Any]:
    if df is None or len(df) < 30:
        return {
            "trend": "UNKNOWN",
            "close": 0.0,
            "sma20": 0.0,
            "sma50": 0.0,
            "bias_score": 0,
        }
    d = df.copy()
    d["sma20"] = d["close"].rolling(20).mean()
    d["sma50"] = d["close"].rolling(50).mean()
    last = d.iloc[-1]
    close = float(last["close"])
    sma20 = float(last["sma20"])
    sma50 = float(last["sma50"])

    score = 0
    if close > sma20:
        score += 1
    else:
        score -= 1
    if close > sma50:
        score += 1
    else:
        score -= 1
    if sma20 > sma50:
        score += 1
    elif sma20 < sma50:
        score -= 1

    if score >= 2:
        trend = "BULLISH"
    elif score <= -2:
        trend = "BEARISH"
    else:
        trend = "SIDEWAYS"

    return {
        "trend": trend,
        "close": round(close, 6),
        "sma20": round(sma20, 6),
        "sma50": round(sma50, 6),
        "bias_score": score,
    }


def support_resistance(df: pd.DataFrame) -> dict[str, list[float]]:
    if df is None or len(df) < 20:
        return {"support": [], "resistance": []}
    recent = df.tail(120)
    levels_low = sorted(set(float(x) for x in recent["low"].tail(60).nsmallest(8).tolist()))
    levels_high = sorted(set(float(x) for x in recent["high"].tail(60).nlargest(8).tolist()))

    support = sorted(levels_low)[:4]
    resistance = sorted(levels_high, reverse=True)[:4]
    resistance = sorted(resistance)
    return {
        "support": [round(x, 6) for x in support],
        "resistance": [round(x, 6) for x in resistance],
    }


def action_to_signal(action: str, bias: str) -> str:
    base_signal = ACTION_TO_SIGNAL.get(str(action or "").upper(), "WAIT")
    if base_signal != "BUY":
        return "WAIT"
    if str(bias or "").upper() == "SHORT":
        return "SELL"
    if str(bias or "").upper() == "LONG":
        return "BUY"
    return "WAIT"


def ai_summary_text(symbol: str, trend: dict[str, Any], decision: dict[str, Any], funding_state: str, volatility: float) -> str:
    signal = action_to_signal(decision.get("action", "WAIT"), decision.get("trade_bias", "NO_TRADE"))
    conf = int(decision.get("probability", 0) or 0)
    trend_name = trend.get("trend", "UNKNOWN")
    risk_tag = "high" if volatility >= 3.0 else "medium" if volatility >= 1.2 else "low"
    return (
        f"{symbol}: {signal} bias with {conf}% confidence. "
        f"Trend {trend_name}, funding {funding_state}, volatility {risk_tag}. "
        "Paper-trading intelligence only; real order execution is disabled."
    )
