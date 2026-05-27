from __future__ import annotations

import threading
import time
from dataclasses import dataclass
from typing import Any


@dataclass
class _CacheItem:
    expires_at: float
    value: Any


class TTLCache:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._store: dict[str, _CacheItem] = {}

    def get(self, key: str) -> Any | None:
        now = time.time()
        with self._lock:
            item = self._store.get(key)
            if not item:
                return None
            if item.expires_at < now:
                self._store.pop(key, None)
                return None
            return item.value

    def set(self, key: str, value: Any, ttl_seconds: int) -> Any:
        with self._lock:
            self._store[key] = _CacheItem(expires_at=time.time() + max(1, ttl_seconds), value=value)
        return value

    def get_or_set(self, key: str, ttl_seconds: int, fetcher):
        cached = self.get(key)
        if cached is not None:
            return cached
        value = fetcher()
        self.set(key, value, ttl_seconds)
        return value
