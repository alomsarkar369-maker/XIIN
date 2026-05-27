from __future__ import annotations

import datetime as dt
import xml.etree.ElementTree as ET
from email.utils import parsedate_to_datetime
from typing import Any

import requests
from fastapi import APIRouter, Query

from .cache import TTLCache

router = APIRouter(prefix="/api", tags=["news"])
cache = TTLCache()
session = requests.Session()

FEEDS: list[tuple[str, str, str]] = [
    ("Crypto", "CoinDesk", "https://www.coindesk.com/arc/outboundfeeds/rss/"),
    ("Crypto", "Cointelegraph", "https://cointelegraph.com/rss"),
    ("World", "Reuters", "https://feeds.reuters.com/reuters/worldNews"),
    ("AI", "VentureBeat", "https://venturebeat.com/ai/feed/"),
]


def _parse_time(raw: str) -> dt.datetime:
    try:
        d = parsedate_to_datetime(raw)
        if d.tzinfo is None:
            d = d.replace(tzinfo=dt.timezone.utc)
        return d.astimezone(dt.timezone.utc)
    except Exception:
        return dt.datetime.now(dt.timezone.utc)


def _fetch_rss(tag: str, source: str, url: str, limit: int = 8) -> list[dict[str, Any]]:
    try:
        r = session.get(url, timeout=10)
        r.raise_for_status()
        root = ET.fromstring(r.text)
    except Exception:
        return []

    items: list[dict[str, Any]] = []
    for node in root.findall(".//item")[:limit]:
        title = (node.findtext("title") or "").strip()
        link = (node.findtext("link") or "").strip()
        pub_raw = (node.findtext("pubDate") or node.findtext("published") or "").strip()
        if not title:
            continue
        pub_dt = _parse_time(pub_raw) if pub_raw else dt.datetime.now(dt.timezone.utc)
        items.append(
            {
                "tag": tag,
                "source": source,
                "title": title,
                "url": link,
                "published_at": pub_dt.isoformat(),
                "published_label": pub_dt.strftime("%Y-%m-%d %H:%M UTC"),
            }
        )
    return items


def _is_fire_news(title: str) -> bool:
    low = title.lower()
    keys = [
        "liquidation",
        "etf",
        "hack",
        "exploit",
        "sec",
        "approval",
        "ban",
        "breakout",
        "funding",
        "whale",
    ]
    return any(k in low for k in keys)


@router.get("/news")
def news_feed(symbol: str = Query("BTCUSDT")) -> dict[str, Any]:
    sym = symbol.upper().strip()

    def _fetch():
        all_items: list[dict[str, Any]] = []
        for tag, source, url in FEEDS:
            all_items.extend(_fetch_rss(tag, source, url, 8))

        all_items.sort(key=lambda x: x.get("published_at", ""), reverse=True)
        now = dt.datetime.now(dt.timezone.utc)

        fire_items = [x for x in all_items if _is_fire_news(x.get("title", ""))]

        today = [x for x in fire_items if (now - _parse_time(x.get("published_at", ""))).days < 1][:8]
        week = [x for x in fire_items if (now - _parse_time(x.get("published_at", ""))).days < 7][:12]
        month = [x for x in fire_items if (now - _parse_time(x.get("published_at", ""))).days < 30][:16]

        return {
            "ok": True,
            "symbol": sym,
            "state": "connected" if all_items else "not_connected_yet",
            "auto_refresh_seconds": 10,
            "items": all_items[:30],
            "fire_news": {
                "today": today,
                "last_1week": week,
                "last_1month": month,
            },
            "fetched_at": now.isoformat(),
            "note": "Click any item to open original source page.",
        }

    return cache.get_or_set(f"news:{sym}", 15, _fetch)
