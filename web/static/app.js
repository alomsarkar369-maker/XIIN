const state = {
  symbol: "BTCUSDT",
  heatWindow: "4h",
  page: "home",
  home: null,
  marketFull: null,
  news: null,
  sources: null,
  bot: null,
  tvSymbol: "",
};

const el = {
  clock: document.getElementById("serverClock"),
  refreshState: document.getElementById("refreshState"),
  symbolInput: document.getElementById("symbolInput"),
  searchBtn: document.getElementById("searchBtn"),
  navBtns: [...document.querySelectorAll(".nav-btn")],
  pages: {
    home: document.getElementById("page-home"),
    market: document.getElementById("page-market"),
    sources: document.getElementById("page-sources"),
  },
  trapLineText: document.getElementById("trapLineText"),
  topMetrics: document.getElementById("topMetrics"),
  heatmapGrid: document.getElementById("heatmapGrid"),
  liqStats: document.getElementById("liqStats"),
  liqRows: document.getElementById("liqRows"),
  coinQuick: document.getElementById("coinQuick"),
  tvWrap: document.getElementById("tvWrap"),
  marketRows: document.getElementById("marketRows"),
  marketRowsFull: document.getElementById("marketRowsFull"),
  newsStream: document.getElementById("newsStream"),
  fireToday: document.getElementById("fireToday"),
  fireWeek: document.getElementById("fireWeek"),
  fireMonth: document.getElementById("fireMonth"),
  sourcesGrid: document.getElementById("sourcesGrid"),
  sourceQuick: document.getElementById("sourceQuick"),
  tabs: [...document.querySelectorAll(".tab")],
};

const fmt = (n, d = 3) => {
  const x = Number(n);
  if (!Number.isFinite(x)) return "N/A";
  return x.toLocaleString(undefined, { maximumFractionDigits: d });
};

async function getJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
  return r.json();
}

function setPage(page) {
  state.page = page;
  Object.entries(el.pages).forEach(([k, v]) => v.classList.toggle("active", k === page));
  el.navBtns.forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  history.replaceState({}, "", `/${page}`);
}

function renderNewsBlock(items, target) {
  const rows = (items || []).slice(0, 10);
  if (!rows.length) {
    target.innerHTML = `<div class="news"><a href="#">Not connected yet</a></div>`;
    return;
  }
  target.innerHTML = rows
    .map(
      (x) => `<article class="news">
  <a target="_blank" rel="noopener noreferrer" href="${x.url || "#"}">${x.title || "Untitled"}</a>
  <div class="meta">${x.source || "source"} | ${x.published_label || x.published_at || ""}</div>
</article>`,
    )
    .join("");
}

function renderSources(rows, target, limit = 8) {
  const list = (rows || []).slice(0, limit);
  target.innerHTML = list
    .map(
      (x) => `<article class="src">
  <h4>${x.name}</h4>
  <p class="${x.state}">${x.status}</p>
  <p>${x.note || ""}</p>
  <a target="_blank" rel="noopener noreferrer" href="${x.url || "#"}">Open Source</a>
</article>`,
    )
    .join("");
}

function renderMarketRows(rows, target, limit = 12) {
  const list = (rows || []).slice(0, limit);
  target.innerHTML = list
    .map(
      (r) => `<tr>
  <td>${r.symbol}</td>
  <td>${fmt(r.price, 5)}</td>
  <td>${fmt(r.change_24h_pct, 2)}%</td>
  <td>${fmt(r.volume_24h_usdt, 0)}</td>
  <td>${fmt(r.funding_rate, 6)}</td>
  <td>${fmt(r.trap_score, 2)}</td>
  <td>${r.trap_bias}</td>
  <td><a target="_blank" rel="noopener noreferrer" href="${r.source_link}">View</a></td>
</tr>`,
    )
    .join("");
}

function renderHeatmap() {
  const map = {
    "1h": state.home?.heatmap_1h?.coins || [],
    "4h": state.home?.heatmap_4h?.coins || [],
    "12h": state.home?.heatmap_12h?.coins || [],
    "24h": state.home?.heatmap_24h?.coins || [],
  };
  const coins = map[state.heatWindow] || [];
  el.heatmapGrid.innerHTML = coins
    .map(
      (c) => `<a class="hm ${c.direction}" href="${c.source_link}" target="_blank" rel="noopener noreferrer">
  <div class="s">${c.symbol}</div>
  <div class="d">Trap ${fmt(c.score, 2)} | ${fmt(c.change_24h_pct, 2)}%</div>
  <div class="d">${c.trap_bias}</div>
</a>`,
    )
    .join("");
}

function renderLiqStats() {
  const s1 = state.home?.heatmap_1h?.coins || [];
  const s4 = state.home?.heatmap_4h?.coins || [];
  const s12 = state.home?.heatmap_12h?.coins || [];
  const s24 = state.home?.heatmap_24h?.coins || [];
  const sum = (arr) => arr.reduce((n, x) => n + Number(x.score || 0), 0);
  const cards = [
    { k: "1h Rekt", v: sum(s1) },
    { k: "4h Rekt", v: sum(s4) },
    { k: "12h Rekt", v: sum(s12) },
    { k: "24h Rekt", v: sum(s24) },
  ];
  el.liqStats.innerHTML = cards.map((c) => `<article class="mini"><div class="k">${c.k}</div><div class="v">${fmt(c.v, 2)}</div></article>`).join("");
}

function renderLiquidationRows() {
  const rows = state.home?.liquidations?.rows || [];
  if (!rows.length) {
    el.liqRows.innerHTML = `<tr><td colspan="5">Not connected yet</td></tr>`;
    return;
  }
  el.liqRows.innerHTML = rows
    .slice(0, 20)
    .map(
      (r) => `<tr>
  <td>${r.symbol}</td>
  <td>${fmt(r.price, 4)}</td>
  <td>${fmt(r.value_usdt, 0)}</td>
  <td>${r.side}</td>
  <td><a target="_blank" rel="noopener noreferrer" href="${r.source_link}">Open</a></td>
</tr>`,
    )
    .join("");
}

function renderTV(symbol) {
  const tv = `BINANCE:${symbol}`;
  if (state.tvSymbol === tv) return;
  state.tvSymbol = tv;
  el.tvWrap.innerHTML = `<iframe title="TradingView" width="100%" height="265" frameborder="0" scrolling="no" src="https://s.tradingview.com/widgetembed/?symbol=${encodeURIComponent(
    tv,
  )}&interval=15&theme=dark&style=1&toolbarbg=111111&allow_symbol_change=1"></iframe>`;
}

function renderHome() {
  const s = state.home?.summary || {};
  const p = state.home?.pulse || {};

  el.trapLineText.textContent = p.line_text || "Not connected yet";
  el.topMetrics.innerHTML = [
    { k: "Price", v: fmt(s.last_price, 5) },
    { k: "24h Change", v: `${fmt(s.change_24h_pct, 2)}%` },
    { k: "Funding", v: fmt(s.funding_rate, 6) },
    { k: "Open Interest", v: fmt(s.open_interest, 2) },
  ]
    .map((x) => `<article class="mini"><div class="k">${x.k}</div><div class="v">${x.v}</div></article>`)
    .join("");

  el.coinQuick.innerHTML = `
<p><span>Symbol:</span> ${s.symbol || state.symbol}</p>
<p><span>Trap Score:</span> ${fmt(s.trap_score, 2)}</p>
<p><span>Bias:</span> ${s.trap_bias || "N/A"}</p>
<p><span>Source:</span> <a target="_blank" rel="noopener noreferrer" href="${s.source_link || "#"}">Owner page</a></p>
`;

  renderHeatmap();
  renderLiqStats();
  renderLiquidationRows();
  renderTV(s.symbol || state.symbol);

  renderMarketRows(state.home?.market?.rows || [], el.marketRows, 12);
}

async function refreshData() {
  try {
    el.refreshState.textContent = "Refreshing...";
    const q = encodeURIComponent(state.symbol);
    const [home, news, sources, bot, marketFull] = await Promise.all([
      getJson(`/api/binance/home?symbol=${q}`),
      getJson(`/api/news?symbol=${q}`),
      getJson(`/api/sources/status`),
      getJson(`/api/bot/performance`),
      getJson(`/api/binance/market-table?limit=35`),
    ]);
    state.home = home;
    state.news = news;
    state.sources = sources;
    state.bot = bot;
    state.marketFull = marketFull;

    renderHome();
    renderNewsBlock(news.items, el.newsStream);
    renderNewsBlock(news.fire_news?.today, el.fireToday);
    renderNewsBlock(news.fire_news?.last_1week, el.fireWeek);
    renderNewsBlock(news.fire_news?.last_1month, el.fireMonth);
    renderSources(sources.rows, el.sourcesGrid, 40);
    renderSources(sources.rows, el.sourceQuick, 8);
    renderMarketRows(marketFull.rows, el.marketRowsFull, 35);
    el.clock.textContent = new Date().toLocaleTimeString();
    el.refreshState.textContent = "Auto 10s";
  } catch (e) {
    console.error(e);
    el.refreshState.textContent = "Error (retry)";
  }
}

function boot() {
  const p = (location.pathname || "/home").replace("/", "");
  setPage(["home", "market", "sources"].includes(p) ? p : "home");

  el.navBtns.forEach((b) => b.addEventListener("click", (ev) => {
    ev.preventDefault();
    setPage(b.dataset.page || "home");
  }));

  el.tabs.forEach((t) => t.addEventListener("click", () => {
    state.heatWindow = t.dataset.window || "4h";
    el.tabs.forEach((x) => x.classList.toggle("active", x === t));
    renderHeatmap();
  }));

  el.searchBtn.addEventListener("click", () => {
    state.symbol = (el.symbolInput.value || "BTCUSDT").toUpperCase().trim();
    refreshData();
  });
  el.symbolInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      state.symbol = (el.symbolInput.value || "BTCUSDT").toUpperCase().trim();
      refreshData();
    }
  });

  refreshData();
  setInterval(refreshData, 10000);
}

boot();
