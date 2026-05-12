# AI DCF Analyst Coworker App

Next.js implementation of the AI DCF Analyst Coworker workflow.

This app powers the portfolio demo at:

```text
https://ai-dcf-analyst-coworker.vercel.app/
```

## Local Development

Use Node.js 24 or newer. The test suite uses Node's native test runner with `.mts` TypeScript modules.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`.

## Verification

```bash
npm test
npm run lint
npm run build
```

## Runtime Notes

- Claude, Gemini, and OpenAI API keys can be entered in the app settings and are kept in browser local storage.
- The same keys can be supplied through server environment variables for deployed use.
- `SEC_USER_AGENT` is recommended for reliable SEC EDGAR requests.
- `GET /api/bootstrap-company?query=AAPL` fetches SEC Company Facts and latest 10-K evidence at runtime.
- The WACC step fetches market data through Yahoo Finance.
- Raw filings are intentionally not committed in the portfolio version.
