from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter

router = APIRouter(prefix="/api/sources", tags=["sources"])


def _row(name: str, url: str, connected: bool, short_note: str) -> dict[str, Any]:
    return {
        "name": name,
        "status": "Connected" if connected else "Not connected yet",
        "state": "connected" if connected else "not_connected",
        "url": url,
        "note": short_note,
    }


@router.get("/status")
def status() -> dict[str, Any]:
    rows = [
        _row("Binance Order Book / Trades", "https://www.binance.com/en/futures", True, "Live public market feed"),
        _row("Bookmap", "https://bookmap.com/", False, "Orderflow depth reference"),
        _row("Exocharts", "https://exocharts.com/", False, "Footprint/trap visual"),
        _row("TradingLite", "https://tradinglite.com/", False, "Heatmap reference"),
        _row("CryptoQuant", "https://cryptoquant.com/", False, "On-chain signal"),
        _row("Glassnode", "https://glassnode.com/", False, "On-chain macro"),
        _row("Arkham", "https://arkhamintelligence.com/", False, "Wallet intelligence"),
        _row("Whale Alert", "https://whale-alert.io/", False, "Whale transfer feed"),
        _row("Exchange inflow/outflow", "https://cryptoquant.com/", False, "Exchange flow context"),
        _row("Coinglass OI", "https://www.coinglass.com/", False, "OI comparison"),
        _row("Bybit Orderbook", "https://www.bybit.com/", False, "External reference"),
        _row("OKX Orderbook", "https://www.okx.com/", False, "External reference"),
        _row("Velo Data", "https://velo.xyz/", False, "Derivatives analytics"),
        _row("Coinglass Liquidation", "https://www.coinglass.com/liquidation", False, "Liquidation map"),
        _row("Coinglass Funding", "https://www.coinglass.com/funding", False, "Funding board"),
        _row("Coinglass Liquidation Heatmap", "https://www.coinglass.com/liquidation-heatmap", False, "Heatmap view"),
        _row("Coinglass Heatmap", "https://www.coinglass.com/", False, "Market heatmap"),
        _row("Hyblock", "https://hyblockcapital.com/", False, "Liquidation map"),
        _row("TradingView ATR", "https://www.tradingview.com/", True, "Chart + ATR view"),
        _row("Coinglass Volatility / Market Data", "https://www.coinglass.com/", False, "Volatility context"),
        _row("Binance Spot / Futures", "https://www.binance.com/en/futures", True, "Primary live feed"),
        _row("Binance Futures OI", "https://www.binance.com/en/futures", True, "Public OI endpoint"),
        _row("Binance Futures Data", "https://www.binance.com/en/futures", True, "Ticker/Depth/Trades"),
        _row("Binance Funding Rate", "https://www.binance.com/en/futures", True, "Funding endpoint"),
        _row("Bybit / OKX Funding", "https://www.bybit.com/", False, "Cross-exchange confirmation"),
        _row("Binance Trades / OI", "https://www.binance.com/en/futures", True, "Live trade pressure"),
        _row("TradingView chart history", "https://www.tradingview.com/", True, "External chart owner"),
        _row("Binance volume regular data", "https://www.binance.com/en/futures", True, "24h volume"),
    ]
    return {
        "ok": True,
        "updated_at": int(time.time()),
        "real_trading_disabled": True,
        "rows": rows,
    }
