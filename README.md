# TICKER:// — Stock Research Terminal

A static site (GitHub Pages) + one serverless function (Netlify) that looks up
any ticker and renders a full research dashboard: snapshot, price history,
financial trend, valuation ratios, ownership/insider activity, auto-generated
notes, and peer comparison. Data comes from Financial Modeling Prep (FMP).

Same split architecture as Vajra: **GitHub Pages hosts the frontend**,
**Netlify hosts the one function that holds the secret API key**, so the key
never touches your GitHub repo.

## 1. Get an FMP API key

1. Sign up free at https://site.financialmodelingprep.com (250 calls/day free tier)
2. Copy your API key from the dashboard.

## 2. Deploy the function to Netlify

1. Push this whole folder to a new GitHub repo (or a `stock-dashboard` folder in an existing one).
2. Go to https://app.netlify.com → **Add new site → Import an existing project** → connect the repo.
3. Build settings: leave build command empty, publish directory `.` (netlify.toml already handles this).
4. Once deployed, go to **Site settings → Environment variables** and add:
   - Key: `FMP_API_KEY`
   - Value: *(paste your FMP key)*
5. Redeploy the site so the env var takes effect.
6. Note your Netlify site URL, e.g. `https://ticker-terminal-xyz.netlify.app`.
7. Test the function directly in your browser:
   `https://ticker-terminal-xyz.netlify.app/.netlify/functions/stock-data?symbol=AAPL`
   You should see a JSON blob back.

## 3. Point the frontend at your function

Open `js/app.js` and replace this line near the top:

```js
const API_ENDPOINT = "https://YOUR-NETLIFY-SITE.netlify.app/.netlify/functions/stock-data";
```

with your real Netlify URL from step 2.6.

## 4. Deploy the frontend to GitHub Pages

1. In your GitHub repo: **Settings → Pages → Source** → deploy from branch → `main` / root.
2. Wait a minute, then visit `https://<your-username>.github.io/<repo-name>/`.
3. Type a ticker (e.g. `AAPL`, `MSFT`, `SNOW`) and hit Run.

## Notes on data coverage

FMP's free tier covers quote, profile, price history, income statement,
ratios, key metrics, and financial growth reliably. **Institutional
ownership, analyst estimates, and some insider-trading detail may require a
paid FMP plan** — the dashboard will show "Requires higher API tier" rather
than breaking if a field isn't available. You can upgrade later without
changing any frontend code; the function will just start returning richer
data automatically.

## Local testing

```bash
npm install -g netlify-cli
netlify dev
```

This runs the function locally at `http://localhost:8888/.netlify/functions/stock-data`.

## File structure

```
stock-dashboard/
├── index.html
├── css/style.css
├── js/app.js
├── netlify.toml
├── netlify/functions/stock-data.js
└── README.md
```
