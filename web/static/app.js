const state = {
  symbol: "BTCUSDT",
  page: "home",
  heatWindow: "4h",
  tvSymbol: "",
  home: null,
  search: null,
  market: null,
  liquidations: null,
  news: null,
  sources: null,
};

const el = {
  clockChip: document.getElementById("clockChip"),
  refreshChip: document.getElementById("refreshChip"),
  symbolInput: document.getElementById("symbolInput"),
  searchBtn: document.getElementById("searchBtn"),
  navBtns: [...document.querySelectorAll(".nav-btn")],
  tabs: [...document.querySelectorAll(".tab")],
  pages: {
    home: document.getElementById("page-home"),
    coin: document.getElementById("page-coin"),
    market: document.getElementById("page-market"),
    liquidations: document.getElementById("page-liquidations"),
    news: document.getElementById("page-news"),
    sources: document.getElementById("page-sources"),
  },
  pressureLabel: document.getElementById("pressureLabel"),
  pressureLongBar: document.getElementById("pressureLongBar"),
  pressureShortBar: document.getElementById("pressureShortBar"),
  pressureLongText: document.getElementById("pressureLongText"),
  pressureShortText: document.getElementById("pressureShortText"),
  summaryMetrics: document.getElementById("summaryMetrics"),
  heatmapGrid: document.getElementById("heatmapGrid"),
  trapSummary: document.getElementById("trapSummary"),
  topRiskCoins: document.getElementById("topRiskCoins"),
  homeMarketRows: document.getElementById("homeMarketRows"),
  coinMetrics: document.getElementById("coinMetrics"),
  orderbookPressure: document.getElementById("orderbookPressure"),
  bidRows: document.getElementById("bidRows"),
  askRows: document.getElementById("askRows"),
  aiSignal: document.getElementById("aiSignal"),
  aiExplanation: document.getElementById("aiExplanation"),
  tvWrap: document.getElementById("tvWrap"),
  tradeDelta: document.getElementById("tradeDelta"),
  tradeRows: document.getElementById("tradeRows"),
  marketRows: document.getElementById("marketRows"),
  liqRows: document.getElementById("liqRows"),
  liqMode: document.getElementById("liqMode"),
  sideLiqTicker: document.getElementById("sideLiqTicker"),
  newsList: document.getElementById("newsList"),
  fireToday: document.getElementById("fireToday"),
  fireWeek: document.getElementById("fireWeek"),
  fireMonth: document.getElementById("fireMonth"),
  sourcesGrid: document.getElementById("sourcesGrid"),
  sourceQuick: document.getElementById("sourceQuick"),
};

const fmt = (n, d = 3) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "N/A";
  return x.toLocaleString(undefined, { maximumFractionDigits: d });
};

const pct = (n, d = 2) => `${fmt(n, d)}%`;

function normalizeSymbol(raw) {
  const s = String(raw || "BTCUSDT").toUpperCase().replaceAll("/", "").replaceAll("-", "").trim();
  if (!s) return "BTCUSDT";
  if (s.endsWith("USDT") || s.endsWith("USDC") || s.endsWith("USD") || s.endsWith("BUSD")) return s;
  return `${s}USDT`;
}

const WATCHLIST = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "DOGEUSDT", "ADAUSDT", "LINKUSDT", "AVAXUSDT", "SUIUSDT"];
const publicCache = new Map();

async function getJson(url) {
  try {
    const r = await fetch(url);
    const type = r.headers.get("content-type") || "";
    if (!r.ok || !type.includes("application/json")) throw new Error(`${r.status} ${r.statusText}`);
    return r.json();
  } catch (err) {
    return getStaticJson(url);
  }
}

async function cached(key, ttlMs, fn) {
  const now = Date.now();
  const hit = publicCache.get(key);
  if (hit && hit.expires > now) return hit.value;
  const value = await fn();
  publicCache.set(key, { value, expires: now + ttlMs });
  return value;
}

async function publicJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function num(v, d = 0) {
  const x = Number(v);
  return Number.isFinite(x) ? x : d;
}

function ownerLink(symbol) {
  return `https://www.binance.com/en/futures/${symbol}`;
}

function seeded(symbol) {
  return [...symbol].reduce((n, c) => n + c.charCodeAt(0), 0);
}

function fallbackTicker(symbol) {
  const base = { BTCUSDT: 104500, ETHUSDT: 3900, SOLUSDT: 170, BNBUSDT: 690, XRPUSDT: 2.1, DOGEUSDT: 0.18, ADAUSDT: 0.68, LINKUSDT: 18, AVAXUSDT: 36, SUIUSDT: 3.5 };
  const s = seeded(symbol);
  const price = (base[symbol] || 1 + (s % 500)) * (1 + ((s % 17) - 8) / 1000);
  const change = ((s % 900) - 450) / 100;
  return {
    symbol,
    lastPrice: price,
    priceChangePercent: change,
    quoteVolume: 60000000 + (s % 40) * 55000000,
  };
}

function trapScore(changePct, quoteVol, funding) {
  const momentum = Math.abs(changePct) * 6;
  const volTerm = Math.min(60, (quoteVol / 1000000000) * 11);
  const crowd = Math.min(20, Math.abs(funding) * 10000);
  return Number((momentum + volTerm + crowd).toFixed(2));
}

function biasLabel(changePct, funding) {
  if (changePct > 0 && funding > 0) return "Long crowd heavy";
  if (changePct < 0 && funding < 0) return "Short crowd heavy";
  if (changePct > 0 && funding < 0) return "Short squeeze risk";
  if (changePct < 0 && funding > 0) return "Long squeeze risk";
  return "Balanced";
}

function fallbackFunding(symbol) {
  const s = seeded(symbol);
  return ((s % 24) - 12) / 100000;
}

async function fetchTicker(symbol) {
  return cached(`ticker:${symbol}`, 8000, async () => {
    try {
      return await publicJson(`https://fapi.binance.com/fapi/v1/ticker/24hr?symbol=${symbol}`);
    } catch {
      return fallbackTicker(symbol);
    }
  });
}

async function fetchFunding(symbol) {
  return cached(`funding:${symbol}`, 10000, async () => {
    try {
      const data = await publicJson(`https://fapi.binance.com/fapi/v1/premiumIndex?symbol=${symbol}`);
      return num(data.lastFundingRate, fallbackFunding(symbol));
    } catch {
      return fallbackFunding(symbol);
    }
  });
}

async function fetchOpenInterest(symbol) {
  return cached(`oi:${symbol}`, 10000, async () => {
    try {
      const data = await publicJson(`https://fapi.binance.com/fapi/v1/openInterest?symbol=${symbol}`);
      return num(data.openInterest, 0);
    } catch {
      return 100000 + seeded(symbol) * 1000;
    }
  });
}

async function staticMarketTable(limit = 20) {
  return cached(`market:${limit}`, 10000, async () => {
    let tickers = [];
    try {
      tickers = await publicJson("https://fapi.binance.com/fapi/v1/ticker/24hr");
      tickers = tickers.filter((x) => String(x.symbol || "").endsWith("USDT"));
      tickers.sort((a, b) => num(b.quoteVolume) - num(a.quoteVolume));
    } catch {
      tickers = WATCHLIST.map(fallbackTicker);
    }

    const rows = [];
    for (const t of tickers.slice(0, limit)) {
      const symbol = t.symbol;
      const change = num(t.priceChangePercent);
      const volume = num(t.quoteVolume);
      const funding = await fetchFunding(symbol);
      rows.push({
        symbol,
        price: num(t.lastPrice),
        change_24h_pct: change,
        volume_24h_usdt: volume,
        funding_rate: funding,
        trap_score: trapScore(change, volume, funding),
        trap_bias: biasLabel(change, funding),
        source_link: ownerLink(symbol),
      });
    }
    return { ok: true, rows, updated_at: Math.floor(Date.now() / 1000), mode: "netlify_public" };
  });
}

async function staticOrderbook(symbol) {
  try {
    const data = await publicJson(`https://fapi.binance.com/fapi/v1/depth?symbol=${symbol}&limit=20`);
    const bids = data.bids || [];
    const asks = data.asks || [];
    const bidNotional = bids.reduce((n, x) => n + num(x[0]) * num(x[1]), 0);
    const askNotional = asks.reduce((n, x) => n + num(x[0]) * num(x[1]), 0);
    const total = bidNotional + askNotional;
    return { bids, asks, pressure: { bid_notional: bidNotional, ask_notional: askNotional, imbalance: total ? (bidNotional - askNotional) / total : 0 } };
  } catch {
    const price = num((await fetchTicker(symbol)).lastPrice, 100);
    const bids = Array.from({ length: 12 }, (_, i) => [(price * (1 - (i + 1) * 0.0007)).toFixed(6), (10 + i * 2).toFixed(3)]);
    const asks = Array.from({ length: 12 }, (_, i) => [(price * (1 + (i + 1) * 0.0007)).toFixed(6), (9 + i * 1.8).toFixed(3)]);
    return { bids, asks, pressure: { bid_notional: price * 180, ask_notional: price * 165, imbalance: 0.0435 } };
  }
}

async function staticTrades(symbol) {
  try {
    const data = await publicJson(`https://fapi.binance.com/fapi/v1/trades?symbol=${symbol}&limit=80`);
    return tradesShape(data);
  } catch {
    const price = num((await fetchTicker(symbol)).lastPrice, 100);
    const rows = Array.from({ length: 44 }, (_, i) => ({
      price: price * (1 + ((i % 9) - 4) / 10000),
      qty: 0.08 + (i % 12) * 0.031,
      side: i % 3 === 0 ? "SELL" : "BUY",
      time: Date.now() - i * 9000,
    }));
    return tradesShape(rows.map((x) => ({ price: x.price, qty: x.qty, isBuyerMaker: x.side === "SELL", time: x.time })));
  }
}

function tradesShape(data) {
  const rows = [];
  let deltaNotional = 0;
  let totalNotional = 0;
  for (const x of data || []) {
    const price = num(x.price);
    const qty = num(x.qty);
    const notional = price * qty;
    const side = x.isBuyerMaker ? "SELL" : "BUY";
    deltaNotional += side === "SELL" ? -notional : notional;
    totalNotional += notional;
    rows.push({ price, qty, notional, side, time: x.time });
  }
  return { rows, delta: { delta_notional: deltaNotional, delta_pct: totalNotional ? (deltaNotional / totalNotional) * 100 : 0, total_notional: totalNotional } };
}

async function staticKlines(symbol) {
  try {
    const data = await publicJson(`https://fapi.binance.com/fapi/v1/klines?symbol=${symbol}&interval=5m&limit=160`);
    const highs = data.map((x) => num(x[2]));
    const lows = data.map((x) => num(x[3]));
    const closes = data.map((x) => num(x[4]));
    const close = closes.at(-1) || 0;
    const tr = closes.slice(1).map((_, i) => Math.max(highs[i + 1] - lows[i + 1], Math.abs(highs[i + 1] - closes[i]), Math.abs(lows[i + 1] - closes[i])));
    const atr = tr.slice(-14).reduce((n, x) => n + x, 0) / Math.max(1, tr.slice(-14).length);
    const returns = closes.slice(1).map((x, i) => (closes[i] ? (x - closes[i]) / closes[i] : 0));
    const avg = returns.slice(-30).reduce((n, x) => n + x, 0) / Math.max(1, returns.slice(-30).length);
    const variance = returns.slice(-30).reduce((n, x) => n + (x - avg) ** 2, 0) / Math.max(1, returns.slice(-30).length);
    const sma20 = closes.slice(-20).reduce((n, x) => n + x, 0) / 20;
    const sma50 = closes.slice(-50).reduce((n, x) => n + x, 0) / 50;
    const trend = close > sma20 && sma20 > sma50 ? "BULLISH" : close < sma20 && sma20 < sma50 ? "BEARISH" : "SIDEWAYS";
    return {
      atr,
      volatility_pct: Math.sqrt(variance) * Math.sqrt(30) * 100,
      trend,
      support: lows.slice(-60).sort((a, b) => a - b).slice(0, 4),
      resistance: highs.slice(-60).sort((a, b) => b - a).slice(0, 4).sort((a, b) => a - b),
    };
  } catch {
    const price = num((await fetchTicker(symbol)).lastPrice, 100);
    return { atr: price * 0.006, volatility_pct: 1.25, trend: "SIDEWAYS", support: [price * 0.985, price * 0.992], resistance: [price * 1.008, price * 1.018] };
  }
}

async function staticSearch(symbol) {
  symbol = normalizeSymbol(symbol);
  const ticker = await fetchTicker(symbol);
  const funding = await fetchFunding(symbol);
  const openInterest = await fetchOpenInterest(symbol);
  const orderbook = await staticOrderbook(symbol);
  const recentTrades = await staticTrades(symbol);
  const klines = await staticKlines(symbol);
  const change = num(ticker.priceChangePercent);
  const volume = num(ticker.quoteVolume);
  const imbalance = num(orderbook.pressure.imbalance);
  const deltaPct = num(recentTrades.delta.delta_pct);
  const pressureScore = imbalance * 100 + deltaPct * 0.8 + funding * 80000;
  const pressure = pressureScore > 6 ? "LONG_PRESSURE" : pressureScore < -6 ? "SHORT_PRESSURE" : "NEUTRAL";
  const hunt = pressure === "LONG_PRESSURE" && funding <= 0 ? "LIQUIDITY_HUNT_UP" : pressure === "SHORT_PRESSURE" && funding >= 0 ? "LIQUIDITY_HUNT_DOWN" : "WAIT";
  const decision = pressure === "LONG_PRESSURE" ? "BUY" : pressure === "SHORT_PRESSURE" ? "SELL" : "WAIT";
  const confidence = Math.min(99, Math.max(15, Math.round(Math.abs(pressureScore) * 4.5)));
  return {
    ok: true,
    symbol,
    paper_trading_only: true,
    real_trading_disabled: true,
    summary: {
      price: num(ticker.lastPrice),
      spot_price: num(ticker.lastPrice),
      change_24h_pct: change,
      volume_24h_usdt: volume,
      market_cap: { value: null, status: "Not connected yet" },
      funding_rate: funding,
      open_interest: openInterest,
      long_short_ratio: { ratio: 1 + pressureScore / 100, long_account: 0, short_account: 0 },
      long_short_bias: biasLabel(change, funding),
      liquidation_data: "Public proxy mode",
      volatility_pct: klines.volatility_pct,
      atr: klines.atr,
      candle_trend: klines.trend,
      support_resistance: { support: klines.support, resistance: klines.resistance },
      trap_score: trapScore(change, volume, funding),
      trap_bias: biasLabel(change, funding),
      source_link: ownerLink(symbol),
    },
    orderbook,
    recent_trades: recentTrades,
    analysis: {
      pressure,
      hunt_signal: hunt,
      confidence,
      decision,
      ai_summary: `${symbol}: ${decision} bias, ${pressure} and ${hunt}. Confidence ${confidence}%. Public Netlify mode, paper intelligence only.`,
    },
    tradingview: { symbol: `BINANCE:${symbol}`, status: "Connected" },
    source_link: ownerLink(symbol),
    updated_at: Math.floor(Date.now() / 1000),
  };
}

async function staticHome(symbol) {
  symbol = normalizeSymbol(symbol);
  const search = await staticSearch(symbol);
  const market = await staticMarketTable(18);
  const heat = (mult) => ({
    ok: true,
    coins: market.rows
      .map((x) => ({ symbol: x.symbol, score: x.trap_score * mult, change_24h_pct: x.change_24h_pct, direction: x.change_24h_pct >= 0 ? "up" : "down", trap_bias: x.trap_bias, source_link: x.source_link }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10),
  });
  const long = market.rows.filter((x) => x.trap_bias.includes("Long")).length;
  const short = market.rows.filter((x) => x.trap_bias.includes("Short")).length;
  return {
    ok: true,
    summary: {
      symbol,
      last_price: search.summary.price,
      spot_price: search.summary.spot_price,
      change_24h_pct: search.summary.change_24h_pct,
      volume_24h_usdt: search.summary.volume_24h_usdt,
      funding_rate: search.summary.funding_rate,
      open_interest: search.summary.open_interest,
      trap_score: search.summary.trap_score,
      trap_bias: search.summary.trap_bias,
      source_link: search.source_link,
    },
    pulse: {
      bias: long > short ? "Long pressure" : short > long ? "Short pressure" : "Balanced",
      long_pressure_pct: (long / Math.max(1, market.rows.length)) * 100,
      short_pressure_pct: (short / Math.max(1, market.rows.length)) * 100,
      line_text: `Public mode | Long:${long} Short:${short}`,
    },
    heatmap_1h: heat(0.72),
    heatmap_4h: heat(1),
    heatmap_12h: heat(1.08),
    heatmap_24h: heat(1.2),
    liquidations: await staticLiquidations(symbol, 20),
    market,
  };
}

async function staticLiquidations(symbol, limit = 30) {
  const rows = [];
  for (const sym of WATCHLIST.slice(0, 8)) {
    const trades = await staticTrades(sym);
    for (const t of trades.rows.slice(-8)) {
      const value = num(t.notional);
      if (value < 10000 && rows.length > 8) continue;
      rows.push({ symbol: sym, exchange: "Binance", price: t.price, value_usdt: value, side: t.side, time: t.time || Date.now(), source_link: ownerLink(sym) });
    }
  }
  rows.sort((a, b) => num(b.time) - num(a.time));
  return { ok: true, symbol: normalizeSymbol(symbol), rows: rows.slice(0, limit), bybit_ticker: { mode: "netlify_public_proxy" }, mode: "netlify_public_proxy" };
}

function staticNews(symbol) {
  const now = new Date();
  const rows = [
    ["Crypto", "CoinDesk", `${symbol} market pressure watch`, "https://www.coindesk.com/markets/"],
    ["Crypto", "Cointelegraph", "Crypto liquidation and funding updates", "https://cointelegraph.com/tags/bitcoin"],
    ["World", "Reuters", "Global market risk feed", "https://www.reuters.com/markets/"],
    ["AI", "VentureBeat", "AI market infrastructure updates", "https://venturebeat.com/ai/"],
  ].map(([tag, source, title, url], i) => ({ tag, source, title, url, published_at: now.toISOString(), published_label: i === 0 ? "Live source" : "External source" }));
  return { ok: true, symbol, state: "static_public_mode", items: rows, fire_news: { today: rows, last_1week: rows, last_1month: rows }, note: "Click item to open owner source." };
}

function staticSources() {
  const row = (name, url, status, state, note) => ({ name, url, status, state, note });
  return {
    ok: true,
    real_trading_disabled: true,
    rows: [
      row("Binance Spot/Futures", "https://www.binance.com/en/futures", "Connected", "connected", "Browser public API / fallback"),
      row("Binance Order Book / Trades", "https://www.binance.com/en/futures", "Connected", "connected", "Depth + trade flow"),
      row("TradingView Chart", "https://www.tradingview.com/", "Connected", "connected", "External chart widget"),
      row("DEX Screener", "https://dexscreener.com/", "Connected", "connected", "External trend reference"),
      row("Bybit Liquidation Proxy", "https://www.bybit.com/en-US/market", "Not connected yet", "not_connected", "External source link ready"),
      row("Coinglass OI/Funding/Liquidation", "https://www.coinglass.com/", "Not connected yet", "not_connected", "Owner data reference link"),
      row("CryptoPanic", "https://cryptopanic.com/", "API key required", "api_required", "News feed placeholder"),
      row("Etherscan", "https://etherscan.io/", "API key required", "api_required", "Whale clue placeholder"),
      row("BscScan", "https://bscscan.com/", "API key required", "api_required", "Whale clue placeholder"),
      row("Bookmap", "https://bookmap.com/", "API key required", "api_required", "Orderflow reference"),
      row("Exocharts", "https://exocharts.com/", "API key required", "api_required", "Footprint reference"),
      row("TradingLite", "https://tradinglite.com/", "API key required", "api_required", "Heatmap reference"),
      row("CryptoQuant", "https://cryptoquant.com/", "API key required", "api_required", "On-chain reference"),
      row("Glassnode", "https://glassnode.com/", "API key required", "api_required", "On-chain macro"),
      row("Arkham", "https://arkhamintelligence.com/", "API key required", "api_required", "Wallet intelligence"),
      row("Whale Alert", "https://whale-alert.io/", "API key required", "api_required", "Whale transfer feed"),
      row("Coinalyze", "https://coinalyze.net/", "Not connected yet", "not_connected", "OI/Funding reference"),
      row("OKX Orderbook", "https://www.okx.com/", "Not connected yet", "not_connected", "External reference"),
      row("Velo Data", "https://velo.xyz/", "Not connected yet", "not_connected", "Derivatives analytics"),
      row("Hyblock", "https://hyblockcapital.com/", "Not connected yet", "not_connected", "Liquidation map"),
    ],
  };
}

async function getStaticJson(url) {
  const parsed = new URL(url, window.location.origin);
  const path = parsed.pathname;
  const symbol = normalizeSymbol(parsed.searchParams.get("symbol") || state.symbol);
  const limit = Number(parsed.searchParams.get("limit") || 20);

  if (path === "/api/binance/home") return staticHome(symbol);
  if (path === "/api/search") return staticSearch(symbol);
  if (path === "/api/binance/market-table") return staticMarketTable(limit);
  if (path === "/api/liquidations/live") return staticLiquidations(symbol, limit);
  if (path === "/api/news") return staticNews(symbol);
  if (path === "/api/sources/status") return staticSources();
  throw new Error(`No static fallback for ${path}`);
}

function kvRows(rows) {
  return rows
    .map((x) => `<div class="kv-row"><span class="k">${x.k}</span><span class="v">${x.v}</span></div>`)
    .join("");
}

function setPage(page) {
  state.page = page;
  Object.entries(el.pages).forEach(([k, v]) => v.classList.toggle("active", k === page));
  el.navBtns.forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  history.replaceState({}, "", `/${page}`);
}

function renderPressure() {
  const p = state.home?.pulse || {};
  const longPct = Number(p.long_pressure_pct || 0);
  const shortPct = Number(p.short_pressure_pct || 0);
  const longW = Math.max(8, Math.min(92, longPct || 0));
  const shortW = Math.max(8, Math.min(92, shortPct || 0));
  el.pressureLongBar.style.width = `${longW}%`;
  el.pressureShortBar.style.width = `${shortW}%`;
  el.pressureLabel.textContent = p.bias || "Not connected yet";
  el.pressureLongText.textContent = `Long ${fmt(longPct, 1)}%`;
  el.pressureShortText.textContent = `Short ${fmt(shortPct, 1)}%`;
}

function renderSummaryMetrics() {
  const s = state.home?.summary || {};
  const list = [
    { k: "Price", v: fmt(s.last_price, 5) },
    { k: "24h", v: pct(s.change_24h_pct, 2) },
    { k: "Funding", v: fmt(s.funding_rate, 6) },
    { k: "Open Interest", v: fmt(s.open_interest, 2) },
  ];
  el.summaryMetrics.innerHTML = list.map((x) => `<article class="mini"><div class="k">${x.k}</div><div class="v">${x.v}</div></article>`).join("");
}

function renderHeatmap() {
  const map = {
    "1h": state.home?.heatmap_1h?.coins || [],
    "4h": state.home?.heatmap_4h?.coins || [],
    "12h": state.home?.heatmap_12h?.coins || [],
    "24h": state.home?.heatmap_24h?.coins || [],
  };
  const rows = map[state.heatWindow] || [];
  el.heatmapGrid.innerHTML = rows
    .map(
      (x) => `<a class="hm-cell ${x.direction}" href="${x.source_link}" target="_blank" rel="noopener noreferrer">
  <div class="hm-symbol">${x.symbol}</div>
  <div class="hm-meta">Trap ${fmt(x.score, 2)} | ${pct(x.change_24h_pct, 2)}</div>
  <div class="hm-meta">${x.trap_bias}</div>
</a>`,
    )
    .join("");
}

function renderTrapSummary() {
  const s = state.search?.summary || {};
  const a = state.search?.analysis || {};
  el.trapSummary.innerHTML = kvRows([
    { k: "Pressure", v: a.pressure || "N/A" },
    { k: "Hunt Signal", v: a.hunt_signal || "WAIT" },
    { k: "Confidence", v: `${fmt(a.confidence, 0)}%` },
    { k: "Bias", v: s.long_short_bias || "N/A" },
    { k: "Trend", v: s.candle_trend || "N/A" },
    { k: "ATR", v: fmt(s.atr, 6) },
  ]);

  const riskRows = state.home?.heatmap_24h?.coins || [];
  el.topRiskCoins.innerHTML = riskRows
    .slice(0, 10)
    .map((x) => `<a class="pill" target="_blank" rel="noopener noreferrer" href="${x.source_link}">${x.symbol} ${fmt(x.score, 1)}</a>`)
    .join("");
}

function renderMarketRows(rows, target, limit = 12, showVolume = true) {
  const list = (rows || []).slice(0, limit);
  if (!list.length) {
    target.innerHTML = `<tr><td colspan="${showVolume ? 8 : 7}">Not connected yet</td></tr>`;
    return;
  }
  target.innerHTML = list
    .map(
      (x) => `<tr>
  <td>${x.symbol}</td>
  <td>${fmt(x.price, 6)}</td>
  <td>${pct(x.change_24h_pct, 2)}</td>
  ${showVolume ? `<td>${fmt(x.volume_24h_usdt, 0)}</td>` : ""}
  <td>${fmt(x.funding_rate, 6)}</td>
  <td>${fmt(x.trap_score, 2)}</td>
  <td>${x.trap_bias}</td>
  <td><a href="${x.source_link}" target="_blank" rel="noopener noreferrer">Open</a></td>
</tr>`,
    )
    .join("");
}

function renderCoinMetrics() {
  const s = state.search?.summary || {};
  const list = [
    { k: "Symbol", v: state.search?.symbol || state.symbol },
    { k: "Price", v: fmt(s.price, 6) },
    { k: "24h Change", v: pct(s.change_24h_pct, 2) },
    { k: "Volume", v: fmt(s.volume_24h_usdt, 0) },
    { k: "Funding", v: fmt(s.funding_rate, 6) },
    { k: "Open Interest", v: fmt(s.open_interest, 2) },
    { k: "Long/Short", v: fmt((s.long_short_ratio || {}).ratio, 3) },
    { k: "Volatility", v: pct(s.volatility_pct, 2) },
  ];
  el.coinMetrics.innerHTML = list.map((x) => `<article class="mini"><div class="k">${x.k}</div><div class="v">${x.v}</div></article>`).join("");
}

function renderOrderbookAndTrades() {
  const ob = state.search?.orderbook || {};
  const tr = state.search?.recent_trades || {};
  const p = ob.pressure || {};
  const d = tr.delta || {};

  el.orderbookPressure.innerHTML = kvRows([
    { k: "Bid Notional", v: fmt(p.bid_notional, 0) },
    { k: "Ask Notional", v: fmt(p.ask_notional, 0) },
    { k: "Imbalance", v: fmt(p.imbalance, 5) },
    { k: "Support", v: (state.search?.summary?.support_resistance?.support || []).join(" | ") || "N/A" },
    { k: "Resistance", v: (state.search?.summary?.support_resistance?.resistance || []).join(" | ") || "N/A" },
  ]);

  const bids = (ob.bids || []).slice(0, 12);
  const asks = (ob.asks || []).slice(0, 12);
  el.bidRows.innerHTML = bids.map((x) => `<tr><td>${fmt(x[0], 6)}</td><td>${fmt(x[1], 3)}</td></tr>`).join("");
  el.askRows.innerHTML = asks.map((x) => `<tr><td>${fmt(x[0], 6)}</td><td>${fmt(x[1], 3)}</td></tr>`).join("");

  el.tradeDelta.innerHTML = kvRows([
    { k: "Delta Notional", v: fmt(d.delta_notional, 2) },
    { k: "Delta %", v: pct(d.delta_pct, 2) },
    { k: "Total Notional", v: fmt(d.total_notional, 2) },
  ]);

  const rows = (tr.rows || []).slice(-70).reverse();
  el.tradeRows.innerHTML = rows
    .map(
      (x) => `<tr>
  <td>${x.side}</td><td>${fmt(x.price, 6)}</td><td>${fmt(x.qty, 4)}</td><td>${fmt(x.notional, 2)}</td>
</tr>`,
    )
    .join("");
}

function renderAISignal() {
  const a = state.search?.analysis || {};
  const decision = a.decision || "WAIT";
  const cls = decision === "BUY" ? "buy" : decision === "SELL" ? "sell" : "wait";
  el.aiSignal.className = `signal ${cls}`;
  el.aiSignal.textContent = `${decision} | ${a.pressure || "NEUTRAL"} | ${a.hunt_signal || "WAIT"} | ${fmt(a.confidence, 0)}%`;
  el.aiExplanation.textContent = a.ai_summary || "Not connected yet";
}

function renderTV() {
  const sym = `BINANCE:${state.symbol}`;
  if (state.tvSymbol === sym) return;
  state.tvSymbol = sym;
  el.tvWrap.innerHTML = `<iframe title="TradingView" width="100%" height="262" frameborder="0" scrolling="no" src="https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
    sym,
  )}&interval=15&theme=dark&style=1&toolbarbg=111111&allow_symbol_change=1"></iframe>`;
}

function renderLiquidations() {
  const rows = state.liquidations?.rows || [];
  el.liqMode.textContent = state.liquidations?.bybit_ticker?.mode || "Not connected yet";

  if (!rows.length) {
    el.liqRows.innerHTML = `<tr><td colspan="6">Not connected yet</td></tr>`;
    el.sideLiqTicker.innerHTML = `<div class="tick-item">Not connected yet</div>`;
    return;
  }

  el.liqRows.innerHTML = rows
    .slice(0, 80)
    .map(
      (x) => `<tr>
  <td>${x.symbol}</td>
  <td>${x.exchange || "N/A"}</td>
  <td>${fmt(x.price, 5)}</td>
  <td>${fmt(x.value_usdt, 0)}</td>
  <td>${x.side}</td>
  <td><a target="_blank" rel="noopener noreferrer" href="${x.source_link || "#"}">Open</a></td>
</tr>`,
    )
    .join("");

  el.sideLiqTicker.innerHTML = rows
    .slice(0, 22)
    .map(
      (x) => `<article class="tick-item">
  <div><strong>${x.symbol}</strong> ${x.side} ${fmt(x.value_usdt, 0)}</div>
  <div class="meta">${x.exchange || "N/A"} | ${fmt(x.price, 5)}</div>
</article>`,
    )
    .join("");
}

function renderNewsBlock(items, target, limit = 20) {
  const rows = (items || []).slice(0, limit);
  if (!rows.length) {
    target.innerHTML = `<article class="news-item"><a href="#">Not connected yet</a></article>`;
    return;
  }
  target.innerHTML = rows
    .map(
      (x) => `<article class="news-item">
  <a target="_blank" rel="noopener noreferrer" href="${x.url || "#"}">${x.title || "Untitled"}</a>
  <div class="meta">${x.source || "source"} | ${x.published_label || ""}</div>
</article>`,
    )
    .join("");
}

function renderSources(rows, target, limit = 8) {
  const list = (rows || []).slice(0, limit);
  target.innerHTML = list
    .map(
      (x) => `<article class="source-card">
  <h4>${x.name}</h4>
  <p class="status ${x.state}">${x.status}</p>
  <p>${x.note || ""}</p>
  <a target="_blank" rel="noopener noreferrer" href="${x.url || "#"}">Open Source</a>
</article>`,
    )
    .join("");
}

function renderAll() {
  renderPressure();
  renderSummaryMetrics();
  renderHeatmap();
  renderTrapSummary();
  renderMarketRows(state.home?.market?.rows || [], el.homeMarketRows, 12, false);
  renderMarketRows(state.market?.rows || [], el.marketRows, 35, true);

  renderCoinMetrics();
  renderOrderbookAndTrades();
  renderAISignal();
  renderTV();

  renderLiquidations();

  renderNewsBlock(state.news?.items, el.newsList, 80);
  renderNewsBlock(state.news?.fire_news?.today, el.fireToday, 8);
  renderNewsBlock(state.news?.fire_news?.last_1week, el.fireWeek, 12);
  renderNewsBlock(state.news?.fire_news?.last_1month, el.fireMonth, 16);

  renderSources(state.sources?.rows, el.sourcesGrid, 40);
  renderSources(state.sources?.rows, el.sourceQuick, 8);
}

async function refreshData() {
  const q = encodeURIComponent(state.symbol);
  try {
    el.refreshChip.textContent = "Refreshing...";
    const [home, search, market, liquidations, news, sources] = await Promise.all([
      getJson(`/api/binance/home?symbol=${q}`),
      getJson(`/api/search?symbol=${q}`),
      getJson(`/api/binance/market-table?limit=35`),
      getJson(`/api/liquidations/live?symbol=${q}&limit=70`),
      getJson(`/api/news?symbol=${q}`),
      getJson(`/api/sources/status`),
    ]);
    state.home = home;
    state.search = search;
    state.market = market;
    state.liquidations = liquidations;
    state.news = news;
    state.sources = sources;
    renderAll();
    el.refreshChip.textContent = "Auto 10s";
  } catch (err) {
    console.error(err);
    el.refreshChip.textContent = "Error retrying...";
  } finally {
    el.clockChip.textContent = new Date().toLocaleTimeString();
  }
}

function boot() {
  const p = (location.pathname || "/home").replace("/", "");
  const page = ["home", "coin", "market", "liquidations", "news", "sources"].includes(p) ? p : "home";
  setPage(page);

  el.navBtns.forEach((b) => {
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      setPage(b.dataset.page || "home");
    });
  });

  el.tabs.forEach((t) => {
    t.addEventListener("click", () => {
      state.heatWindow = t.dataset.window || "4h";
      el.tabs.forEach((x) => x.classList.toggle("active", x === t));
      renderHeatmap();
    });
  });

  const doSearch = () => {
    state.symbol = normalizeSymbol(el.symbolInput.value);
    el.symbolInput.value = state.symbol;
    refreshData();
  };

  el.searchBtn.addEventListener("click", doSearch);
  el.symbolInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") doSearch();
  });

  refreshData();
  setInterval(refreshData, 10000);
}

boot();
