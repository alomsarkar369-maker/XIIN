# CoinGlass Reference Notes (for LIQTRAP UI/UX)

Date: 2026-05-27

## Observed UI Patterns

1. Top quick metrics strip:
- Open Interest
- Liquidation
- AVG RSI
- Altcoin Season Index
- CGDI index

2. Market navigator / category filters:
- Derivatives, Spot, Categories
- Thematic filters (ETH/SOL/AI/Gaming etc.)

3. Derivatives-focused table columns:
- Symbol, Price, 24h %
- Funding Rate
- Volume (24h)
- Market Cap
- OI, OI (1h%), OI (24h%)
- Liquidation (24h)

4. Coin-level futures page modules:
- OI-weighted funding chart
- Exchange open interest chart
- Volume chart
- Futures trade count
- Long/Short + liquidation side stats

5. Heat/Liquidity modules:
- Liquidation Heatmap
- Liquidation Map / Max Pain style pressure zones

## API Surface (CoinGlass docs v4 shown)

Potential endpoints to wire later (if key enabled):
- `/api/futures/liquidation/order`
- `/api/futures/liquidation/max-pain`
- `/api/futures/liquidation/coin-list`
- plus OI/Funding/Long-Short/Orderbook families

Auth style:
- header `CG-API-KEY`

## Mapping to Current LIQTRAP Web

Already aligned:
- Symbol search intelligence
- Funding / OI / liquidation sections
- Binance + Bybit live snapshots
- Source health placeholders
- TradingView chart integration

Next alignment upgrades:
1. Add top "index strip" component (OI, Liquidation, RSI, Altcoin Season, CGDI placeholders).
2. Expand derivatives table with OI delta windows (1h/24h) where data available.
3. Add dedicated liquidation heatmap panel card (connected/placeholder state).
4. Add coin page mini-tabs: Funding / OI / Volume / Liquidation views.
5. Add "Gainers & Losers" block in home terminal layout.

## Safety

- Keep premium/payed sources optional.
- If API/key missing, show:
  - Not connected yet
  - API key required
  - Coming soon
- Never expose secret keys in frontend.
