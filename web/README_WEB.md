# LIQTRAP WEB TERMINAL

Public-data crypto intelligence dashboard (paper-analysis only).

## Safety Rules Applied
- Website is standalone from old trading bot.
- Real trading execution is disabled.
- No `.env`, key, token, password, or private IP is exposed in frontend/API.
- Unavailable sources return `Not connected yet` / `API key required` safely.

## Pages
- Home
- Coin Intelligence
- Market
- Liquidations
- News
- Sources

## Free/Public Sources Wired
- Binance public API (price, 24h stats, depth, trades, funding, OI, long/short ratio)
- Bybit public REST proxy for liquidation pressure ticker
- DexScreener public API (search + trend clues)
- TradingView widget
- RSS-based live news feeds
- Premium/optional source placeholders with owner links

## Local Run (Windows)
1. `python -m pip install -r requirements_web.txt`
2. `RUN_WEB.bat`
3. Open `http://127.0.0.1:8010`

## Main API Endpoints
- `/api/search?symbol=BTCUSDT`
- `/api/binance/futures?symbol=BTCUSDT`
- `/api/binance/orderbook?symbol=BTCUSDT`
- `/api/binance/trades?symbol=BTCUSDT`
- `/api/binance/market-table?limit=35`
- `/api/liquidations/live?symbol=BTCUSDT`
- `/api/news?symbol=BTCUSDT`
- `/api/sources/status`

## Deploy Notes
- Vercel-compatible via `api/index.py` + `vercel.json`
- Netlify static publish remains `web/static` (UI only; no backend runtime)
