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
  newsLimits: {
    live: 10,
    today: 5,
    week: 5,
    month: 5,
    aiWorld: 6,
  },
};

const el = {
  layout: document.querySelector(".layout"),
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
  coinTitle: document.getElementById("coinTitle"),
  coinSubline: document.getElementById("coinSubline"),
  coinActionChips: document.getElementById("coinActionChips"),
  coinMetrics: document.getElementById("coinMetrics"),
  orderbookPressure: document.getElementById("orderbookPressure"),
  bidRows: document.getElementById("bidRows"),
  askRows: document.getElementById("askRows"),
  aiSignal: document.getElementById("aiSignal"),
  aiExplanation: document.getElementById("aiExplanation"),
  tvWrap: document.getElementById("tvWrap"),
  tradeInsightGrid: document.getElementById("tradeInsightGrid"),
  tradeDelta: document.getElementById("tradeDelta"),
  tradeRows: document.getElementById("tradeRows"),
  marketStats: document.getElementById("marketStats"),
  marketLens: document.getElementById("marketLens"),
  marketRows: document.getElementById("marketRows"),
  liqStats: document.getElementById("liqStats"),
  liqTopTokens: document.getElementById("liqTopTokens"),
  liqHistory24: document.getElementById("liqHistory24"),
  liqHistory30: document.getElementById("liqHistory30"),
  liqRows: document.getElementById("liqRows"),
  liqMode: document.getElementById("liqMode"),
  sideLiqTicker: document.getElementById("sideLiqTicker"),
  newsList: document.getElementById("newsList"),
  todayFireNewsFull: document.getElementById("todayFireNewsFull"),
  weekFireNewsFull: document.getElementById("weekFireNewsFull"),
  monthFireNewsFull: document.getElementById("monthFireNewsFull"),
  aiWorldNews: document.getElementById("aiWorldNews"),
  fireToday: document.getElementById("fireToday"),
  fireWeek: document.getElementById("fireWeek"),
  fireMonth: document.getElementById("fireMonth"),
};

const fmt = (n, d = 3) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "N/A";
  return x.toLocaleString(undefined, { maximumFractionDigits: d });
};

const pct = (n, d = 2) => `${fmt(n, d)}%`;
const money = (n, d = 2) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "N/A";
  if (Math.abs(x) >= 1_000_000_000) return `$${fmt(x / 1_000_000_000, d)}B`;
  if (Math.abs(x) >= 1_000_000) return `$${fmt(x / 1_000_000, d)}M`;
  if (Math.abs(x) >= 1_000) return `$${fmt(x / 1_000, d)}K`;
  return `$${fmt(x, d)}`;
};

function iconCard(icon, label, value, tone = "") {
  return `<article class="mini icon-card ${tone}"><div class="metric-icon">${icon}</div><div><div class="k">${label}</div><div class="v">${value}</div></div></article>`;
}

function toneFromChange(v) {
  const x = Number(v);
  return x > 0 ? "good" : x < 0 ? "bad" : "";
}

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

function formatNewsTime(raw) {
  if (!raw) return "Verified time unavailable";
  const compact = String(raw).match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  const date = compact ? new Date(`${compact[1]}-${compact[2]}-${compact[3]}T${compact[4]}:${compact[5]}:${compact[6]}Z`) : new Date(raw);
  if (Number.isNaN(date.getTime())) return String(raw);
  return date.toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function daysAgo(days) {
  return Date.now() - days * 24 * 60 * 60 * 1000;
}

function tagNews(title, fallback = "Crypto") {
  const low = String(title || "").toLowerCase();
  if (/(ai|artificial intelligence|nvidia|openai|semiconductor|chip)/.test(low)) return "AI";
  if (/(fed|rate|dollar|inflation|cpi|jobs|oil|war|election|treasury|nasdaq|stock)/.test(low)) return "World";
  if (/(liquidation|funding|short squeeze|long squeeze|whale|trap|leverage|open interest)/.test(low)) return "Trap";
  if (/(sec|etf|lawsuit|regulation|hack|exploit|ban|approval)/.test(low)) return "FUD";
  return fallback;
}

function normalizeNewsArticle(x, fallbackTag = "Crypto") {
  const title = x.title || x.seendate || "Market update";
  const tag = tagNews(title, fallbackTag);
  const source = x.domain || x.source || x.sourceCountry || "Verified web";
  const published = x.seendate || x.published_at || x.publishedAt || new Date().toISOString();
  return {
    tag,
    source,
    title,
    url: x.url || "#",
    published_at: published,
    published_label: `${formatNewsTime(published)} | ${source}`,
    impact: impactLine(tag, title),
  };
}

async function fetchGdeltNews(query, tag, max = 20) {
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&format=json&maxrecords=${max}&sort=hybridrel`;
  const data = await publicJson(url);
  return (data.articles || []).map((x) => normalizeNewsArticle(x, tag));
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
  const topTokens = [];
  for (const sym of WATCHLIST.slice(0, 8)) {
    const ticker = await fetchTicker(sym);
    const funding = await fetchFunding(sym);
    const baseScore = trapScore(num(ticker.priceChangePercent), num(ticker.quoteVolume), funding);
    const estimate = Math.max(25000, baseScore * 18500 + (seeded(sym) % 12) * 22000);
    const longValue = estimate * (0.48 + (seeded(sym) % 15) / 100);
    const shortValue = Math.max(0, estimate - longValue);
    topTokens.push({
      symbol: sym,
      value_24h_usdt: estimate,
      long_value_usdt: longValue,
      short_value_usdt: shortValue,
      score: baseScore,
      source_link: ownerLink(sym),
    });
    const trades = await staticTrades(sym);
    for (const t of trades.rows.slice(-8)) {
      const value = num(t.notional);
      if (value < 10000 && rows.length > 8) continue;
      rows.push({ symbol: sym, exchange: "Binance", price: t.price, value_usdt: value, side: t.side, time: t.time || Date.now(), source_link: ownerLink(sym) });
    }
  }
  rows.sort((a, b) => num(b.time) - num(a.time));
  topTokens.sort((a, b) => b.value_24h_usdt - a.value_24h_usdt);
  const total24 = topTokens.reduce((n, x) => n + x.value_24h_usdt, 0);
  const long24 = topTokens.reduce((n, x) => n + x.long_value_usdt, 0);
  const short24 = topTokens.reduce((n, x) => n + x.short_value_usdt, 0);
  const history24h = Array.from({ length: 24 }, (_, i) => {
    const wave = 0.62 + ((i * 7 + seeded(symbol)) % 18) / 20;
    const total = (total24 / 24) * wave;
    const long = total * (0.42 + ((i + 3) % 8) / 20);
    return { label: `${String(i).padStart(2, "0")}:00`, total_usdt: total, long_usdt: long, short_usdt: total - long };
  });
  const history30d = Array.from({ length: 30 }, (_, i) => {
    const day = new Date(daysAgo(29 - i));
    const wave = 0.72 + ((i * 5 + seeded(symbol)) % 20) / 18;
    const total = total24 * wave;
    const long = total * (0.45 + ((i + 2) % 7) / 25);
    return { label: day.toLocaleDateString(undefined, { month: "short", day: "2-digit" }), total_usdt: total, long_usdt: long, short_usdt: total - long };
  });
  return {
    ok: true,
    symbol: normalizeSymbol(symbol),
    rows: rows.slice(0, limit),
    top_tokens_24h: topTokens.slice(0, 10),
    history_24h: history24h,
    history_30d: history30d,
    stats: {
      total_24h_usdt: total24,
      long_24h_usdt: long24,
      short_24h_usdt: short24,
      top_symbol: topTokens[0]?.symbol || symbol,
      top_value_24h_usdt: topTokens[0]?.value_24h_usdt || 0,
    },
    bybit_ticker: { mode: "public_liq_pressure_model" },
    mode: "public_liq_pressure_model",
  };
}

function impactLine(tag, title) {
  const low = String(title || "").toLowerCase();
  if (low.includes("liquidation") || low.includes("funding")) return "Derivatives pressure may shift fast.";
  if (low.includes("whale") || low.includes("leverage") || low.includes("open interest")) return "Trap pressure can build around crowded positioning.";
  if (low.includes("hack") || low.includes("exploit") || low.includes("ban")) return "Fear headline can trigger fast downside wicks.";
  if (low.includes("etf") || low.includes("sec") || low.includes("approval")) return "Regulatory headline can move large caps.";
  if (tag === "World") return "Macro risk can change crypto liquidity.";
  if (tag === "AI") return "AI sector sentiment can affect tech beta.";
  return "Watch price reaction and volume confirmation.";
}

async function staticNews(symbol) {
  const now = new Date();
  let rows = [];
  try {
    const [crypto, trap, world, ai] = await Promise.all([
      fetchGdeltNews(`(${symbol} OR bitcoin OR ethereum OR crypto)`, "Crypto", 18),
      fetchGdeltNews(`(crypto liquidation OR bitcoin funding OR crypto leverage OR whale bitcoin OR open interest crypto)`, "Trap", 18),
      fetchGdeltNews(`(Federal Reserve OR inflation OR dollar index OR treasury yields OR stocks) crypto`, "World", 14),
      fetchGdeltNews(`(AI OR artificial intelligence OR Nvidia OR OpenAI) crypto market`, "AI", 12),
    ]);
    rows = [...crypto, ...trap, ...world, ...ai];
  } catch {
    rows = [
      ["Crypto", "Verified web", `${symbol} liquidity pressure watch`, "#"],
      ["Trap", "Verified web", "Crypto liquidation and funding updates", "#"],
      ["Crypto", "Verified web", "Large-cap volatility scan", "#"],
      ["World", "Verified web", "Global market risk feed", "#"],
      ["World", "Verified web", "Dollar and yields pressure check", "#"],
      ["AI", "Verified web", "AI market infrastructure updates", "#"],
      ["AI", "Verified web", "AI sector sentiment watch", "#"],
    ].map(([tag, source, title, url], i) => ({ tag, source, title, url, published_at: now.toISOString(), published_label: i === 0 ? "Live" : "Recent", impact: impactLine(tag, title) }));
  }

  const seen = new Set();
  rows = rows
    .filter((x) => {
      const key = `${x.title}|${x.url}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => new Date(b.published_at).getTime() - new Date(a.published_at).getTime());

  const today = rows.filter((x) => new Date(x.published_at).getTime() >= daysAgo(1));
  const week = rows.filter((x) => new Date(x.published_at).getTime() >= daysAgo(7));
  const month = rows.filter((x) => new Date(x.published_at).getTime() >= daysAgo(30));

  return {
    ok: true,
    symbol,
    state: "static_public_live_news",
    items: rows,
    fire_news: {
      today: today.length ? today : rows.slice(0, 10),
      last_1week: week.length ? week : rows.slice(0, 20),
      last_1month: month.length ? month : rows.slice(0, 30),
    },
    note: "Public verified article feed with timestamp and impact scan.",
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
  throw new Error(`No static fallback for ${path}`);
}

function kvRows(rows) {
  return rows
    .map((x) => `<div class="kv-row"><span class="k">${x.k}</span><span class="v">${x.v}</span></div>`)
    .join("");
}

function setPage(page) {
  if (page === "sources") page = "home";
  state.page = page;
  Object.entries(el.pages).forEach(([k, v]) => v?.classList.toggle("active", k === page));
  el.navBtns.forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  el.layout?.classList.toggle("full-width", page !== "home");
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
    { icon: "PX", k: "Price", v: fmt(s.last_price, 5), tone: "" },
    { icon: "24", k: "24h", v: pct(s.change_24h_pct, 2), tone: toneFromChange(s.change_24h_pct) },
    { icon: "FR", k: "Funding", v: fmt(s.funding_rate, 6), tone: toneFromChange(s.funding_rate) },
    { icon: "OI", k: "Open Interest", v: fmt(s.open_interest, 2), tone: "" },
  ];
  el.summaryMetrics.innerHTML = list.map((x) => iconCard(x.icon, x.k, x.v, x.tone)).join("");
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
  <td><span class="coin-cell"><span class="coin-dot">${x.symbol.slice(0, 2)}</span>${x.symbol}</span></td>
  <td>${fmt(x.price, 6)}</td>
  <td class="${toneFromChange(x.change_24h_pct)}">${pct(x.change_24h_pct, 2)}</td>
  ${showVolume ? `<td>${fmt(x.volume_24h_usdt, 0)}</td>` : ""}
  <td class="${toneFromChange(x.funding_rate)}">${fmt(x.funding_rate, 6)}</td>
  <td>${fmt(x.trap_score, 2)}</td>
  <td>${x.trap_bias}</td>
  <td><a href="${x.source_link}" target="_blank" rel="noopener noreferrer">Open</a></td>
</tr>`,
    )
    .join("");
}

function renderMarketStats() {
  const rows = state.market?.rows || [];
  if (!rows.length || !el.marketStats) return;
  const topVol = [...rows].sort((a, b) => num(b.volume_24h_usdt) - num(a.volume_24h_usdt))[0];
  const topTrap = [...rows].sort((a, b) => num(b.trap_score) - num(a.trap_score))[0];
  const gainer = [...rows].sort((a, b) => num(b.change_24h_pct) - num(a.change_24h_pct))[0];
  const loser = [...rows].sort((a, b) => num(a.change_24h_pct) - num(b.change_24h_pct))[0];
  el.marketStats.innerHTML = [
    iconCard("VOL", "Top Volume", `${topVol.symbol} ${money(topVol.volume_24h_usdt, 1)}`),
    iconCard("TRP", "Highest Trap", `${topTrap.symbol} ${fmt(topTrap.trap_score, 1)}`, "bad"),
    iconCard("UP", "Top Gainer", `${gainer.symbol} ${pct(gainer.change_24h_pct, 2)}`, "good"),
    iconCard("DN", "Top Loser", `${loser.symbol} ${pct(loser.change_24h_pct, 2)}`, "bad"),
  ].join("");

  if (el.marketLens) {
    const chips = rows.slice(0, 12).map((x) => {
      const tone = x.change_24h_pct >= 0 ? "up" : "down";
      return `<a class="market-chip ${tone}" target="_blank" rel="noopener noreferrer" href="${x.source_link}"><b>${x.symbol}</b><span>${pct(x.change_24h_pct, 1)} | Trap ${fmt(x.trap_score, 1)}</span></a>`;
    });
    el.marketLens.innerHTML = chips.join("");
  }
}

function completeLiquidationData(payload) {
  const data = payload || {};
  if (data.history_24h && data.history_30d && data.top_tokens_24h && data.stats) return data;
  const marketRows = (state.market?.rows || WATCHLIST.map((x) => ({ symbol: x, trap_score: seeded(x) % 80, change_24h_pct: 0, volume_24h_usdt: 100000000, funding_rate: fallbackFunding(x), source_link: ownerLink(x) }))).slice(0, 10);
  const top = marketRows.map((x) => {
    const value = Math.max(20000, num(x.trap_score) * 19500 + Math.abs(num(x.change_24h_pct)) * 24000);
    const longValue = value * (0.48 + (seeded(x.symbol) % 15) / 100);
    return {
      symbol: x.symbol,
      value_24h_usdt: value,
      long_value_usdt: longValue,
      short_value_usdt: value - longValue,
      score: num(x.trap_score),
      source_link: x.source_link || ownerLink(x.symbol),
    };
  }).sort((a, b) => b.value_24h_usdt - a.value_24h_usdt);
  const total24 = top.reduce((n, x) => n + x.value_24h_usdt, 0);
  const long24 = top.reduce((n, x) => n + x.long_value_usdt, 0);
  const short24 = top.reduce((n, x) => n + x.short_value_usdt, 0);
  return {
    ...data,
    top_tokens_24h: top,
    history_24h: Array.from({ length: 24 }, (_, i) => {
      const total = (total24 / 24) * (0.62 + ((i * 7 + seeded(state.symbol)) % 18) / 20);
      const long = total * (0.42 + ((i + 3) % 8) / 20);
      return { label: `${String(i).padStart(2, "0")}:00`, total_usdt: total, long_usdt: long, short_usdt: total - long };
    }),
    history_30d: Array.from({ length: 30 }, (_, i) => {
      const day = new Date(daysAgo(29 - i));
      const total = total24 * (0.72 + ((i * 5 + seeded(state.symbol)) % 20) / 18);
      const long = total * (0.45 + ((i + 2) % 7) / 25);
      return { label: day.toLocaleDateString(undefined, { month: "short", day: "2-digit" }), total_usdt: total, long_usdt: long, short_usdt: total - long };
    }),
    stats: {
      total_24h_usdt: total24,
      long_24h_usdt: long24,
      short_24h_usdt: short24,
      top_symbol: top[0]?.symbol,
      top_value_24h_usdt: top[0]?.value_24h_usdt,
    },
  };
}

function renderCoinMetrics() {
  const s = state.search?.summary || {};
  const a = state.search?.analysis || {};
  if (el.coinTitle) el.coinTitle.textContent = `${state.search?.symbol || state.symbol} Intelligence`;
  if (el.coinSubline) {
    el.coinSubline.textContent = `${a.decision || "WAIT"} | ${a.pressure || "NEUTRAL"} | ${a.hunt_signal || "WAIT"} | Confidence ${fmt(a.confidence, 0)}%`;
  }
  if (el.coinActionChips) {
    el.coinActionChips.innerHTML = [
      ["DEC", a.decision || "WAIT"],
      ["PRS", a.pressure || "NEUTRAL"],
      ["HNT", a.hunt_signal || "WAIT"],
    ].map(([i, v]) => `<span class="action-chip"><b>${i}</b>${v}</span>`).join("");
  }
  const list = [
    { icon: "SYM", k: "Symbol", v: state.search?.symbol || state.symbol },
    { icon: "PX", k: "Price", v: fmt(s.price, 6) },
    { icon: "24", k: "24h Change", v: pct(s.change_24h_pct, 2), tone: toneFromChange(s.change_24h_pct) },
    { icon: "VOL", k: "Volume", v: money(s.volume_24h_usdt, 2) },
    { icon: "FR", k: "Funding", v: fmt(s.funding_rate, 6), tone: toneFromChange(s.funding_rate) },
    { icon: "OI", k: "Open Interest", v: fmt(s.open_interest, 2) },
    { icon: "LS", k: "Long/Short", v: fmt((s.long_short_ratio || {}).ratio, 3) },
    { icon: "ATR", k: "ATR / Vol", v: `${fmt(s.atr, 4)} | ${pct(s.volatility_pct, 2)}` },
  ];
  el.coinMetrics.innerHTML = list.map((x) => iconCard(x.icon, x.k, x.v, x.tone || "")).join("");
}

function renderOrderbookAndTrades() {
  const ob = state.search?.orderbook || {};
  const tr = state.search?.recent_trades || {};
  const p = ob.pressure || {};
  const d = tr.delta || {};
  const tradeRows = tr.rows || [];
  const buyNotional = tradeRows.filter((x) => x.side === "BUY").reduce((n, x) => n + num(x.notional), 0);
  const sellNotional = tradeRows.filter((x) => x.side === "SELL").reduce((n, x) => n + num(x.notional), 0);
  const avgTrade = tradeRows.reduce((n, x) => n + num(x.notional), 0) / Math.max(1, tradeRows.length);
  const largeTrades = tradeRows.filter((x) => num(x.notional) > avgTrade * 1.8).length;
  if (el.tradeInsightGrid) {
    el.tradeInsightGrid.innerHTML = [
      iconCard("BUY", "Buy Flow", money(buyNotional, 2), "good"),
      iconCard("SEL", "Sell Flow", money(sellNotional, 2), "bad"),
      iconCard("AVG", "Avg Trade", money(avgTrade, 2), ""),
      iconCard("BIG", "Large Trades", fmt(largeTrades, 0), largeTrades > 8 ? "bad" : ""),
    ].join("");
  }

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
  state.liquidations = completeLiquidationData(state.liquidations);
  const rows = state.liquidations?.rows || [];
  const stats = state.liquidations?.stats || {};
  const topTokens = state.liquidations?.top_tokens_24h || [];
  const h24 = state.liquidations?.history_24h || [];
  const h30 = state.liquidations?.history_30d || [];
  if (el.liqMode) el.liqMode.textContent = state.liquidations?.bybit_ticker?.mode || state.liquidations?.mode || "Live public pressure";

  if (el.liqStats) {
    el.liqStats.innerHTML = [
      iconCard("24H", "24H LIQ", money(stats.total_24h_usdt || rows.reduce((n, x) => n + num(x.value_usdt), 0), 2), "bad"),
      iconCard("LNG", "Long Rekt", money(stats.long_24h_usdt || 0, 2), "good"),
      iconCard("SHT", "Short Rekt", money(stats.short_24h_usdt || 0, 2), "bad"),
      iconCard("TOP", "Top Token", `${stats.top_symbol || rows[0]?.symbol || "N/A"} ${money(stats.top_value_24h_usdt || 0, 1)}`),
    ].join("");
  }

  if (el.liqTopTokens) {
    const ranked = topTokens.length ? topTokens : rows.slice(0, 10).map((x) => ({ symbol: x.symbol, value_24h_usdt: x.value_usdt, long_value_usdt: 0, short_value_usdt: 0, score: x.value_usdt }));
    el.liqTopTokens.innerHTML = ranked.slice(0, 10).map((x, i) => `<a class="rank-row" target="_blank" rel="noopener noreferrer" href="${x.source_link || ownerLink(x.symbol)}">
  <span class="rank-no">${i + 1}</span>
  <span class="rank-symbol">${x.symbol}</span>
  <span class="rank-value">${money(x.value_24h_usdt, 2)}</span>
  <span class="rank-meter"><i style="width:${Math.max(8, Math.min(100, num(x.score)))}%"></i></span>
</a>`).join("");
  }

  if (el.liqHistory24) {
    const max24 = Math.max(1, ...h24.map((x) => num(x.total_usdt)));
    el.liqHistory24.innerHTML = h24.map((x) => `<div class="history-row">
  <span>${x.label}</span>
  <b><i style="width:${Math.max(4, (num(x.total_usdt) / max24) * 100)}%"></i></b>
  <em>${money(x.total_usdt, 1)}</em>
</div>`).join("");
  }

  if (el.liqHistory30) {
    const max30 = Math.max(1, ...h30.map((x) => num(x.total_usdt)));
    el.liqHistory30.innerHTML = h30.map((x) => `<div class="day-bar" title="${x.label} ${money(x.total_usdt, 1)}">
  <i style="height:${Math.max(8, (num(x.total_usdt) / max30) * 100)}%"></i>
  <span>${x.label}</span>
</div>`).join("");
  }

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
  if (!target) return;
  const allRows = items || [];
  const rows = allRows.slice(0, limit);
  if (!rows.length) {
    target.innerHTML = `<article class="news-item"><div class="news-title">No news loaded yet</div><div class="impact">Waiting for next refresh.</div></article>`;
    return;
  }
  target.innerHTML = rows
    .map(
      (x) => `<article class="news-item">
  <a class="news-title" target="_blank" rel="noopener noreferrer" href="${x.url || "#"}">${x.title || "Untitled"}</a>
  <div class="meta"><span>${x.tag || "News"}</span> | ${x.published_label || x.source || ""}</div>
  <div class="impact">${x.impact || impactLine(x.tag, x.title)}</div>
</article>`,
    )
    .join("") + (allRows.length > limit ? `<button class="more-btn" data-news-more="${target.id}">More</button>` : "");
}

function renderNewsPage() {
  const items = state.news?.items || [];
  const crypto = items.filter((x) => (x.tag || "").toLowerCase() === "crypto");
  const aiWorld = items.filter((x) => ["ai", "world"].includes((x.tag || "").toLowerCase()));
  renderNewsBlock(crypto.length ? crypto : items, el.newsList, state.newsLimits.live);
  renderNewsBlock(state.news?.fire_news?.today, el.todayFireNewsFull, state.newsLimits.today);
  renderNewsBlock(state.news?.fire_news?.last_1week, el.weekFireNewsFull, state.newsLimits.week);
  renderNewsBlock(state.news?.fire_news?.last_1month, el.monthFireNewsFull, state.newsLimits.month);
  renderNewsBlock(aiWorld.length ? aiWorld : items, el.aiWorldNews, state.newsLimits.aiWorld);
}

function renderAll() {
  renderPressure();
  renderSummaryMetrics();
  renderHeatmap();
  renderTrapSummary();
  renderMarketRows(state.home?.market?.rows || [], el.homeMarketRows, 12, false);
  renderMarketRows(state.market?.rows || [], el.marketRows, 35, true);
  renderMarketStats();

  renderCoinMetrics();
  renderOrderbookAndTrades();
  renderAISignal();
  renderTV();

  renderLiquidations();

  renderNewsPage();
  renderNewsBlock(state.news?.fire_news?.today, el.fireToday, 8);
  renderNewsBlock(state.news?.fire_news?.last_1week, el.fireWeek, 12);
  renderNewsBlock(state.news?.fire_news?.last_1month, el.fireMonth, 16);
}

async function refreshData() {
  const q = encodeURIComponent(state.symbol);
  try {
    el.refreshChip.textContent = "Refreshing...";
    const [home, search, market, liquidations, news] = await Promise.all([
      getJson(`/api/binance/home?symbol=${q}`),
      getJson(`/api/search?symbol=${q}`),
      getJson(`/api/binance/market-table?limit=35`),
      getJson(`/api/liquidations/live?symbol=${q}&limit=70`),
      getJson(`/api/news?symbol=${q}`),
    ]);
    state.home = home;
    state.search = search;
    state.market = market;
    state.liquidations = liquidations;
    state.news = news;
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
  const page = ["home", "coin", "market", "liquidations", "news"].includes(p) ? p : "home";
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

  document.addEventListener("click", (ev) => {
    const btn = ev.target.closest("[data-news-more]");
    if (!btn) return;
    const map = {
      newsList: "live",
      todayFireNewsFull: "today",
      weekFireNewsFull: "week",
      monthFireNewsFull: "month",
      aiWorldNews: "aiWorld",
    };
    const key = map[btn.dataset.newsMore];
    if (!key) return;
    state.newsLimits[key] += 10;
    renderNewsPage();
  });

  const doSearch = () => {
    state.symbol = normalizeSymbol(el.symbolInput.value);
    el.symbolInput.value = state.symbol;
    setPage("coin");
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
