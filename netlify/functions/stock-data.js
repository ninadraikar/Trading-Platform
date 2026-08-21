// netlify/functions/stock-data.js
//
// Server-side proxy to Financial Modeling Prep (FMP).
// The FMP_API_KEY environment variable is set in the Netlify dashboard
// (Site settings -> Environment variables) and is NEVER exposed to the browser.

// FMP retired free-tier access to /api/v3/ — everything now goes through /stable/,
// which uses ?symbol=XXX query params instead of /XXX path params.
const BASE = "https://financialmodelingprep.com/stable";

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

  // Each entry: [resultKey, url] — all on /stable/, symbol passed as a query param.
  const endpoints = {
    quote: `${BASE}/quote?symbol=${symbol}&apikey=${apiKey}`,
    profile: `${BASE}/profile?symbol=${symbol}&apikey=${apiKey}`,
    history: `${BASE}/historical-price-eod/full?symbol=${symbol}&apikey=${apiKey}`,
    income: `${BASE}/income-statement?symbol=${symbol}&limit=6&apikey=${apiKey}`,
    incomeQuarterly: `${BASE}/income-statement?symbol=${symbol}&period=quarter&limit=6&apikey=${apiKey}`,
    ratios: `${BASE}/ratios?symbol=${symbol}&limit=6&apikey=${apiKey}`,
    keyMetrics: `${BASE}/key-metrics?symbol=${symbol}&limit=6&apikey=${apiKey}`,
    growth: `${BASE}/financial-growth?symbol=${symbol}&limit=6&apikey=${apiKey}`,
    insiderTrading: `${BASE}/insider-trading/search?symbol=${symbol}&limit=20&apikey=${apiKey}`,
    institutionalOwnership: `${BASE}/institutional-ownership/symbol-summary?symbol=${symbol}&apikey=${apiKey}`,
    analystEstimates: `${BASE}/analyst-estimates?symbol=${symbol}&limit=4&apikey=${apiKey}`,
    peers: `${BASE}/stock-peers?symbol=${symbol}&apikey=${apiKey}`,
    dividends: `${BASE}/dividends?symbol=${symbol}&apikey=${apiKey}`,
    earningsCalendar: `${BASE}/earnings?symbol=${symbol}&apikey=${apiKey}`,
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

  // Second pass: /stable/quote only takes one symbol per call, so fetch each
  // peer individually (in parallel) to get PE / % change alongside price/mktCap.
  const peerList = Array.isArray(results.peers)
    ? results.peers.map((p) => p.symbol).filter(Boolean).slice(0, 5)
    : [];

  if (peerList.length) {
    const peerQuotes = await Promise.all(
      peerList.map(async (sym) => {
        try {
          const res = await fetch(`${BASE}/quote?symbol=${sym}&apikey=${apiKey}`);
          if (!res.ok) return null;
          const arr = await res.json();
          return Array.isArray(arr) ? arr[0] : null;
        } catch {
          return null;
        }
      })
    );
    results.peerQuotes = peerQuotes.filter(Boolean);
  } else {
    results.peerQuotes = [];
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ symbol, fetchedAt: new Date().toISOString(), data: results }),
  };
};
