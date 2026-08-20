// netlify/functions/stock-data.js
//
// Server-side proxy to Financial Modeling Prep (FMP).
// The FMP_API_KEY environment variable is set in the Netlify dashboard
// (Site settings -> Environment variables) and is NEVER exposed to the browser.

const BASE = "https://financialmodelingprep.com/api/v3";
const BASE_STABLE = "https://financialmodelingprep.com/stable";

exports.handler = async (event) => {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Content-Type": "application/json",
  };

  const symbol = (event.queryStringParameters?.symbol || "").trim().toUpperCase();

  if (!symbol) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "Missing ?symbol=" }) };
  }

  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "FMP_API_KEY is not configured on the server." }),
    };
  }

  // Each entry: [resultKey, url]
  const endpoints = {
    quote: `${BASE}/quote/${symbol}?apikey=${apiKey}`,
    profile: `${BASE}/profile/${symbol}?apikey=${apiKey}`,
    history: `${BASE}/historical-price-full/${symbol}?timeseries=365&apikey=${apiKey}`,
    income: `${BASE}/income-statement/${symbol}?limit=6&apikey=${apiKey}`,
    incomeQuarterly: `${BASE}/income-statement/${symbol}?period=quarter&limit=6&apikey=${apiKey}`,
    ratios: `${BASE}/ratios/${symbol}?limit=6&apikey=${apiKey}`,
    keyMetrics: `${BASE}/key-metrics/${symbol}?limit=6&apikey=${apiKey}`,
    growth: `${BASE}/financial-growth/${symbol}?limit=6&apikey=${apiKey}`,
    insiderTrading: `${BASE}/insider-trading?symbol=${symbol}&limit=20&apikey=${apiKey}`,
    institutionalOwnership: `${BASE_STABLE}/institutional-ownership/symbol-summary?symbol=${symbol}&apikey=${apiKey}`,
    analystEstimates: `${BASE}/analyst-estimates/${symbol}?limit=4&apikey=${apiKey}`,
    peers: `${BASE_STABLE}/stock-peers?symbol=${symbol}&apikey=${apiKey}`,
    dividends: `${BASE}/historical-price-full/stock_dividend/${symbol}?apikey=${apiKey}`,
    earningsCalendar: `${BASE}/earning_calendar/${symbol}?apikey=${apiKey}`,
  };

  const results = {};

  await Promise.all(
    Object.entries(endpoints).map(async ([key, url]) => {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          results[key] = { __error: `HTTP ${res.status}` };
          return;
        }
        const data = await res.json();
        // FMP returns {"Error Message": "..."} on plan-restricted endpoints
        if (data && data["Error Message"]) {
          results[key] = { __error: data["Error Message"] };
        } else {
          results[key] = data;
        }
      } catch (err) {
        results[key] = { __error: err.message };
      }
    })
  );

  // Second pass: pull quotes for a handful of peer symbols, if we got any back.
  const peerList = Array.isArray(results.peers?.[0]?.peersList)
    ? results.peers[0].peersList
    : Array.isArray(results.peers)
    ? results.peers.map((p) => p.symbol).filter(Boolean)
    : [];

  if (peerList.length) {
    const topPeers = peerList.slice(0, 5).join(",");
    try {
      const res = await fetch(`${BASE}/quote/${topPeers}?apikey=${apiKey}`);
      results.peerQuotes = res.ok ? await res.json() : [];
    } catch {
      results.peerQuotes = [];
    }
  } else {
    results.peerQuotes = [];
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ symbol, fetchedAt: new Date().toISOString(), data: results }),
  };
};
