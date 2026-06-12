from __future__ import annotations

import time
from typing import Any

import requests
from fastapi import APIRouter

from .cache import TTLCache

router = APIRouter(prefix="/api/sources", tags=["sources"])
cache = TTLCache()
session = requests.Session()


def _is_up(url: str, timeout: int = 5) -> bool:
    try:
        r = session.get(url, timeout=timeout)
        return r.status_code < 500
    except Exception:
        return False


def _row(name: str, url: str, connected: bool, short_note: str, premium: bool = False) -> dict[str, Any]:
    if premium and not connected:
        status = "API key required"
        state = "api_required"
    elif connected:
        status = "Connected"
        state = "connected"
    else:
        status = "Not connected yet"
        state = "not_connected"
    return {
        "name": name,
        "status": status,
        "state": state,
        "url": url,
        "note": short_note,
    }


@router.get("/status")
def status() -> dict[str, Any]:
    def _fetch():
        binance_ok = _is_up("https://fapi.binance.com/fapi/v1/ping")
        bybit_ok = _is_up("https://api.bybit.com/v5/market/time")
        dex_ok = _is_up("https://api.dexscreener.com/latest/dex/search?q=BTC")

        rows = [
            _row("Binance Spot/Futures", "https://www.binance.com/en/futures", binance_ok, "Live public market feed"),
            _row("Binance Order Book / Trades", "https://www.binance.com/en/futures", binance_ok, "Depth + trade flow"),
            _row("Binance Funding/OI", "https://www.binance.com/en/futures", binance_ok, "Funding and open interest"),
            _row("Bybit Liquidation Proxy", "https://www.bybit.com/en-US/market", bybit_ok, "Large trade based liquidation pressure"),
            _row("DEX Screener", "https://dexscreener.com/", dex_ok, "Trending/new pair and liquidity clue"),
            _row("TradingView Chart", "https://www.tradingview.com/", True, "External advanced chart"),
            _row("Coinalyze", "https://coinalyze.net/", False, "OI/Funding/Liquidation reference"),
            _row("CryptoPanic", "https://cryptopanic.com/", False, "News feed placeholder", premium=True),
            _row("Etherscan", "https://etherscan.io/", False, "Whale transfer clue placeholder", premium=True),
            _row("BscScan", "https://bscscan.com/", False, "Whale transfer clue placeholder", premium=True),
            _row("Bookmap", "https://bookmap.com/", False, "Orderflow depth reference", premium=True),
            _row("Exocharts", "https://exocharts.com/", False, "Footprint/trap visual", premium=True),
            _row("TradingLite", "https://tradinglite.com/", False, "Heatmap reference", premium=True),
            _row("CryptoQuant", "https://cryptoquant.com/", False, "On-chain signal", premium=True),
            _row("Glassnode", "https://glassnode.com/", False, "On-chain macro", premium=True),
            _row("Arkham", "https://arkhamintelligence.com/", False, "Wallet intelligence", premium=True),
            _row("Whale Alert", "https://whale-alert.io/", False, "Whale transfer feed", premium=True),
            _row("Coinglass OI/Funding/Liquidation", "https://www.coinglass.com/", False, "Owner data reference link"),
            _row("OKX Orderbook", "https://www.okx.com/", False, "External reference"),
            _row("Velo Data", "https://velo.xyz/", False, "Derivatives analytics"),
            _row("Hyblock", "https://hyblockcapital.com/", False, "Liquidation map"),
        ]
        return {
            "ok": True,
            "updated_at": int(time.time()),
            "real_trading_disabled": True,
            "rows": rows,
        }

    return cache.get_or_set("sources:status", 45, _fetch)
