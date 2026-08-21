// js/app.js
//
// IMPORTANT: since this site is served from GitHub Pages but the API function
// runs on Netlify, this needs the FULL Netlify site URL (not a relative path).
// After you deploy the "netlify/functions" folder to Netlify, replace the URL
// below with your real Netlify site address, e.g.:
//   https://your-site-name.netlify.app/.netlify/functions/stock-data
const API_ENDPOINT = "https://fantastic-llama-2dcc9e.netlify.app/.netlify/functions/stock-data";

const form = document.getElementById("lookup-form");
const input = document.getElementById("ticker-input");
const statusLine = document.getElementById("status-line");
const dashboard = document.getElementById("dashboard");

let priceChart = null;
let financialsChart = null;

// ---------- Helpers ----------
function fmtMoney(n, opts = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: opts.decimals ?? 2,
  }).format(n);
}

function fmtBig(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e12) return (n / 1e12).toFixed(2) + "T";
  if (abs >= 1e9) return (n / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return (n / 1e6).toFixed(2) + "M";
  if (abs >= 1e3) return (n / 1e3).toFixed(2) + "K";
  return String(n);
}

function fmtPct(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return `${(n * (Math.abs(n) < 1.5 ? 100 : 1)).toFixed(decimals)}%`;
}

function fmtNum(n, decimals = 2) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Number(n).toFixed(decimals);
}

function kvItem(label, value, cls = "") {
  const div = document.createElement("div");
  div.className = "kv-item";
  div.innerHTML = `<div class="kv-label">${label}</div><div class="kv-value ${cls}">${value}</div>`;
  return div;
}

function setStatus(msg, isError = false) {
  statusLine.textContent = msg;
  statusLine.classList.toggle("error", isError);
}

// ---------- Decorative ticker tape (static, no API burn) ----------
function buildTape() {
  const sample = [
    ["AAPL", "up"], ["MSFT", "up"], ["NVDA", "down"], ["GOOGL", "up"],
    ["AMZN", "down"], ["SNOW", "up"], ["PLTR", "up"], ["META", "down"],
    ["TSLA", "up"], ["HUBS", "down"], ["NOK", "up"], ["AVGO", "up"],
  ];
  const tape = document.getElementById("tape");
  const seq = [...sample, ...sample]
    .map(([sym, dir]) => `<span class="${dir}">${sym} ${dir === "up" ? "▲" : "▼"}</span>`)
    .join("");
  tape.innerHTML = seq;
}
buildTape();

// ---------- Main lookup ----------
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const symbol = input.value.trim().toUpperCase();
  if (!symbol) return;

  setStatus(`fetching ${symbol}...`);
  dashboard.classList.add("hidden");

  try {
    const res = await fetch(`${API_ENDPOINT}?symbol=${encodeURIComponent(symbol)}`);
    const payload = await res.json();

    if (!res.ok) {
      setStatus(payload.error || "Something went wrong.", true);
      return;
    }

    render(payload.data, symbol);
    setStatus(`last updated ${new Date(payload.fetchedAt).toLocaleString()}`);
    dashboard.classList.remove("hidden");
  } catch (err) {
    setStatus(`Request failed: ${err.message}`, true);
  }
});

function render(data, symbol) {
  const quote = Array.isArray(data.quote) ? data.quote[0] : null;
  const profile = Array.isArray(data.profile) ? data.profile[0] : null;

  renderIdentity(quote, profile, symbol);
  renderSnapshot(quote, profile, data);
  renderPriceChart(data.history);
  renderFinancialsChart(data.income);
  renderValuation(data.ratios, data.keyMetrics);
  renderOwnership(data.institutionalOwnership, data.insiderTrading);
  renderNotes(data.income, data.growth, data.ratios, profile);
  renderPeers(data.peerQuotes);
}

function renderIdentity(quote, profile, symbol) {
  document.getElementById("company-name").textContent = profile?.companyName || quote?.name || symbol;
  document.getElementById("company-symbol").textContent = symbol;
  document.getElementById("company-exchange").textContent = quote?.exchange || profile?.exchangeShortName || "—";
  document.getElementById("company-sector").textContent = profile?.sector || "—";

  const priceMain = document.getElementById("price-main");
  const priceChange = document.getElementById("price-change");
  if (quote) {
    priceMain.textContent = fmtMoney(quote.price);
    const dir = quote.changesPercentage >= 0 ? "up" : "down";
    priceChange.textContent = `${quote.change >= 0 ? "+" : ""}${fmtNum(quote.change)} (${fmtNum(quote.changesPercentage)}%)`;
    priceChange.className = `price-change ${dir}`;
  } else {
    priceMain.textContent = "—";
    priceChange.textContent = "";
  }
}

function renderSnapshot(quote, profile, data) {
  const grid = document.getElementById("snapshot-grid");
  grid.innerHTML = "";
  if (!quote) {
    grid.appendChild(kvItem("Status", "No quote data returned"));
    return;
  }
  const items = [
    ["Market Cap", fmtBig(quote.marketCap)],
    ["P/E (TTM)", fmtNum(quote.pe)],
    ["EPS (TTM)", fmtMoney(quote.eps)],
    ["52W Range", `${fmtMoney(quote.yearLow)} – ${fmtMoney(quote.yearHigh)}`],
    ["Volume", fmtBig(quote.volume)],
    ["Avg Volume", fmtBig(quote.avgVolume)],
    ["Day Range", `${fmtMoney(quote.dayLow)} – ${fmtMoney(quote.dayHigh)}`],
    ["Open / Prev Close", `${fmtMoney(quote.open)} / ${fmtMoney(quote.previousClose)}`],
    ["Shares Out.", fmtBig(quote.sharesOutstanding)],
    ["Beta", profile?.beta != null ? fmtNum(profile.beta) : "—"],
  ];
  items.forEach(([label, val]) => grid.appendChild(kvItem(label, val)));
}

function renderPriceChart(history) {
  const ctx = document.getElementById("price-chart");
  // FMP /stable/historical-price-eod/full returns a flat array (newest first).
  const raw = Array.isArray(history) ? history : Array.isArray(history?.historical) ? history.historical : [];
  const series = [...raw].reverse();

  if (priceChart) priceChart.destroy();
  if (!series.length) return;

  priceChart = new Chart(ctx, {
    type: "line",
    data: {
      labels: series.map((d) => d.date),
      datasets: [
        {
          data: series.map((d) => d.close),
          borderColor: "#c9a227",
          backgroundColor: "rgba(201,162,39,0.08)",
          fill: true,
          borderWidth: 1.5,
          pointRadius: 0,
          tension: 0.15,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { display: true, ticks: { maxTicksLimit: 8, color: "#566078", font: { family: "IBM Plex Mono", size: 10 } }, grid: { color: "rgba(34,48,73,0.4)" } },
        y: { ticks: { color: "#566078", font: { family: "IBM Plex Mono", size: 10 } }, grid: { color: "rgba(34,48,73,0.4)" } },
      },
    },
  });
}

function renderFinancialsChart(income) {
  const ctx = document.getElementById("financials-chart");
  const series = Array.isArray(income) ? [...income].reverse() : [];

  if (financialsChart) financialsChart.destroy();
  if (!series.length) return;

  financialsChart = new Chart(ctx, {
    type: "bar",
    data: {
      labels: series.map((d) => d.calendarYear || d.date?.slice(0, 4)),
      datasets: [
        { label: "Revenue", data: series.map((d) => d.revenue), backgroundColor: "#3a4b6e" },
        { label: "Net Income", data: series.map((d) => d.netIncome), backgroundColor: "#c9a227" },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: "#8a93a6", font: { family: "IBM Plex Mono", size: 11 } } },
      },
      scales: {
        x: { ticks: { color: "#566078", font: { family: "IBM Plex Mono", size: 10 } }, grid: { display: false } },
        y: {
          ticks: {
            color: "#566078",
            font: { family: "IBM Plex Mono", size: 10 },
            callback: (v) => fmtBig(v),
          },
          grid: { color: "rgba(34,48,73,0.4)" },
        },
      },
    },
  });
}

function renderValuation(ratios, keyMetrics) {
  const tbody = document.querySelector("#valuation-table tbody");
  tbody.innerHTML = "";
  const r = Array.isArray(ratios) ? ratios[0] : null;
  const k = Array.isArray(keyMetrics) ? keyMetrics[0] : null;

  if (!r && !k) {
    tbody.innerHTML = `<tr><td class="label-cell">Not available on current API plan</td></tr>`;
    return;
  }

  const rows = [
    ["P/E Ratio", r?.priceEarningsRatio],
    ["P/S Ratio", r?.priceToSalesRatio],
    ["P/B Ratio", r?.priceToBookRatio],
    ["EV / EBITDA", k?.enterpriseValueOverEBITDA],
    ["PEG Ratio", r?.priceEarningsToGrowthRatio],
    ["Dividend Yield", r?.dividendYield != null ? fmtPct(r.dividendYield) : null],
    ["ROE", r?.returnOnEquity != null ? fmtPct(r.returnOnEquity) : null],
    ["ROIC", k?.roic != null ? fmtPct(k.roic) : null],
    ["Debt / Equity", r?.debtEquityRatio],
    ["Current Ratio", r?.currentRatio],
    ["Free Cash Flow / Share", k?.freeCashFlowPerShare != null ? fmtMoney(k.freeCashFlowPerShare) : null],
  ];

  rows.forEach(([label, val]) => {
    const tr = document.createElement("tr");
    const display = val === null || val === undefined ? "—" : typeof val === "number" ? fmtNum(val) : val;
    tr.innerHTML = `<td class="label-cell">${label}</td><td class="num">${display}</td>`;
    tbody.appendChild(tr);
  });
}

function renderOwnership(institutional, insiderTrading) {
  const grid = document.getElementById("ownership-grid");
  grid.innerHTML = "";

  const inst = Array.isArray(institutional) ? institutional[0] : institutional;
  if (inst && !inst.__error) {
    grid.appendChild(kvItem("Institutional Holders", fmtBig(inst.investorsHolding ?? inst.numberOf13Fshares)));
    grid.appendChild(kvItem("Institutional Shares Held", fmtBig(inst.numberOfShares ?? inst.totalInvested)));
  } else {
    grid.appendChild(kvItem("Institutional Ownership", "Requires higher API tier"));
  }

  const tbody = document.querySelector("#insider-table tbody");
  tbody.innerHTML = "";
  const trades = Array.isArray(insiderTrading) ? insiderTrading.slice(0, 8) : [];
  if (!trades.length) {
    tbody.innerHTML = `<tr><td class="label-cell">No recent insider transactions returned</td></tr>`;
    return;
  }
  trades.forEach((t) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="label-cell">${t.transactionDate || "—"}</td>
      <td>${t.reportingName || "—"}</td>
      <td>${t.transactionType || "—"}</td>
      <td class="num">${t.securitiesTransacted != null ? fmtBig(t.securitiesTransacted) : "—"}</td>
    `;
    tbody.appendChild(tr);
  });
}

function renderNotes(income, growth, ratios, profile) {
  const list = document.getElementById("notes-list");
  list.innerHTML = "";
  const notes = [];

  const inc = Array.isArray(income) ? income : [];
  if (inc.length >= 2) {
    const latest = inc[0], prior = inc[1];
    const revGrowth = ((latest.revenue - prior.revenue) / prior.revenue) * 100;
    notes.push(`Revenue ${revGrowth >= 0 ? "grew" : "declined"} ${Math.abs(revGrowth).toFixed(1)}% YoY in the latest fiscal year (${latest.calendarYear}).`);

    const marginLatest = latest.netIncome / latest.revenue;
    const marginPrior = prior.netIncome / prior.revenue;
    const marginDelta = (marginLatest - marginPrior) * 100;
    notes.push(`Net margin ${marginDelta >= 0 ? "expanded" : "compressed"} ${Math.abs(marginDelta).toFixed(1)} pts YoY, to ${(marginLatest * 100).toFixed(1)}%.`);
  }

  const r = Array.isArray(ratios) ? ratios[0] : null;
  if (r?.debtEquityRatio != null) {
    const level = r.debtEquityRatio > 1.5 ? "elevated" : r.debtEquityRatio < 0.3 ? "conservative" : "moderate";
    notes.push(`Debt/Equity of ${r.debtEquityRatio.toFixed(2)}x is ${level} for the sector.`);
  }

  if (profile?.description) {
    const short = profile.description.split(". ").slice(0, 2).join(". ") + ".";
    notes.push(short);
  }

  if (!notes.length) notes.push("Not enough data returned to generate notes for this ticker.");

  notes.forEach((n) => {
    const li = document.createElement("li");
    li.textContent = n;
    list.appendChild(li);
  });
}

function renderPeers(peerQuotes) {
  const tbody = document.querySelector("#peers-table tbody");
  tbody.innerHTML = "";
  if (!Array.isArray(peerQuotes) || !peerQuotes.length) {
    tbody.innerHTML = `<tr><td colspan="5" class="label-cell">No peer data returned</td></tr>`;
    return;
  }
  peerQuotes.forEach((p) => {
    const dir = p.changesPercentage >= 0 ? "up" : "down";
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${p.symbol}</td>
      <td class="num">${fmtMoney(p.price)}</td>
      <td class="num">${fmtBig(p.marketCap)}</td>
      <td class="num">${fmtNum(p.pe)}</td>
      <td class="num kv-value ${dir}">${fmtNum(p.changesPercentage)}%</td>
    `;
    tbody.appendChild(tr);
  });
}
