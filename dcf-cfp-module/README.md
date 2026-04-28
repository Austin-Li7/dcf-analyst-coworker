# DCF CFP Module

Next.js implementation of the AI DCF workflow prototype.

## Scripts

```bash
npm install
npm run dev
npm test
npm run lint
npm run build
```

## Notes

- API keys are entered in the app settings and kept in browser local storage.
- The WACC step fetches market data from Yahoo Finance.
- `GET /api/bootstrap-company?ticker=AAPL` fetches SEC Company Facts at runtime and returns a sanitized baseline package.
- Raw filings are intentionally not committed in the portfolio version.
