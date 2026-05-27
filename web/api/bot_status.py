from __future__ import annotations

import time
from typing import Any

from fastapi import APIRouter

router = APIRouter(prefix="/api/bot", tags=["bot"])


@router.get("/performance")
def performance() -> dict[str, Any]:
    return {
        "ok": True,
        "mode": "standalone_demo",
        "connected_to_old_bot": False,
        "real_trading_disabled": True,
        "summary": {
            "closed_trades": 0,
            "wins": 0,
            "losses": 0,
            "win_rate_pct": 0.0,
            "total_pnl_pct": 0.0,
            "open_positions": 0,
        },
        "message": "Bot integration intentionally disabled. This website runs fully separate.",
        "updated_at": int(time.time()),
    }


@router.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "site_status": "live",
        "bot_connection": "disabled_by_design",
        "real_trading_disabled": True,
        "agent_health_status": "standalone_mode",
        "exchange_confirmation_score": None,
        "updated_at": int(time.time()),
    }
