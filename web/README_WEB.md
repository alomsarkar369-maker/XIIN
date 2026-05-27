# LIQTRAP AI Web Terminal

## Local Run (Windows)
1. Install requirements:
   - `python -m pip install -r requirements_web.txt`
2. Start server:
   - `RUN_WEB.bat`
3. Open:
   - `http://127.0.0.1:8010`

## Core Endpoints
- `/api/search?symbol=BTCUSDT`
- `/api/binance/orderbook?symbol=BTCUSDT`
- `/api/binance/trades?symbol=BTCUSDT`
- `/api/binance/futures?symbol=BTCUSDT`
- `/api/bot/performance`
- `/api/bot/health`
- `/api/news`
- `/api/sources/status`

## Safety
- No secret key exposure in frontend.
- Paper trading mode only.
- Real trade execution is not enabled in web module.
- Existing bot files are untouched.

## Notes
- Some premium sources are placeholders by design (Bookmap/Glassnode/Arkham/etc.).
- UI refreshes every 10 seconds with backend caching.
