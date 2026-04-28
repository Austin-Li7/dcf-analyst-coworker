# AI DCF Analyst Coworker

A source-grounded investment research coworker that helps investors build reviewable DCF valuations with AI-generated drafts, structured artifacts, human checkpoints, and an interactive Next.js dashboard.

The project combines:

- step-by-step DCF prompt contracts for business architecture, historical financials, competition, synergies, forecasting, WACC, and valuation review
- typed structured artifacts with validation tests
- a Next.js analyst workflow for reviewing, editing, exporting, and valuing generated outputs
- market-data integration for WACC and valuation bridge inputs

## Why This Exists

One-shot AI valuation is fragile: it can skip source checks, hide weak assumptions, and turn uncertain claims into confident prose. This project takes a coworker approach instead. The AI drafts and organizes the analysis, while the investor reviews sources, edits assumptions, and keeps final judgment.

The workflow is designed around a controlled pattern:

1. each analytical step has a narrow prompt contract
2. each response is parsed into a typed machine artifact
3. each artifact has a human review checkpoint
4. downstream steps consume approved structured data rather than raw chat output
5. the final valuation view exposes assumptions, WACC, implied value, and audit notes

## Current Capabilities

- **Prompt workflow source of truth**: final v5.5 prompt set in `v5.5_DCF/`
- **Interactive analyst app**: `dcf-cfp-module/` contains the Next.js workflow interface
- **Structured validation**: Zod schemas and Node tests cover each major artifact contract
- **DCF demo fixture**: lightweight JSON/CSV/TXT fixtures are retained for repeatable local tests
- **Market data fetch**: WACC step can fetch ticker-level market data through Yahoo Finance
- **SEC bootstrap endpoint**: `/api/bootstrap-company?ticker=AAPL` builds a lightweight DCF baseline from SEC Company Facts at runtime

## Implementation Process

This was built as an AI-assisted product prototype. The visual workflow and UI implementation were developed with heavy coding-agent assistance, then refined around the valuation workflow I designed.

My main contributions were:

- designing the v5.5 DCF prompt architecture and step boundaries
- defining the structured artifact pattern: `machine_artifact`, `reviewer_summary`, `ui_handoff`
- specifying review checkpoints and validation behavior
- testing the prompt system against public-company examples
- integrating schemas, route behavior, and valuation logic into a runnable app prototype
- curating the project into a clean portfolio artifact with only publishable code, prompts, and sanitized demos

The project should be read as an AI-assisted investment research coworker and workflow prototype, not as a claim that every UI component was manually authored from scratch or that the system replaces investor judgment.

## Data Strategy

The portfolio version avoids committing raw SEC filings, spreadsheets, or proprietary handoff material. It keeps only lightweight sanitized fixtures needed for tests.

For a production-grade public demo, the preferred path is an **auto-bootstrap flow**:

1. user enters a ticker
2. the app fetches public company identifiers and filings from SEC EDGAR
3. the app fetches market data from Yahoo Finance
4. the app derives a baseline DCF input package
5. the user reviews the generated source manifest before running LLM analysis

The portfolio code includes the first backend slice of this pattern through `GET /api/bootstrap-company?ticker=...`, which fetches SEC Company Facts at runtime and returns a sanitized baseline package. The UI can be extended to call this endpoint before Step 1/2 so a public demo does not require checked-in raw filings.

## Running Locally

```bash
cd dcf-cfp-module
npm install
npm run dev
```

Open `http://localhost:3000`.

The LLM-backed analysis routes require API keys entered through the app settings. Keys are stored locally in the browser and are not committed to the repository.

For SEC bootstrap requests, set `SEC_USER_AGENT` in `.env.local` so SEC can identify the client.

## Deployment

This is a Next.js app, so it can be deployed as a normal web application. The simplest portfolio path is to push this repository to GitHub and connect `dcf-cfp-module/` to Vercel. Vercel will build the app and provide a public URL that people can open directly in a browser.

Required deployment settings:

- root directory: `dcf-cfp-module`
- build command: `npm run build`
- install command: `npm install`
- environment variables: `ANTHROPIC_API_KEY` and/or `GEMINI_API_KEY` if server-side keys are desired; `SEC_USER_AGENT` for SEC bootstrap requests

The app also supports entering LLM keys in the browser settings UI for local experimentation.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the exact Vercel setup steps.

## Verification

```bash
cd dcf-cfp-module
npm test
npm run lint
npm run build
```

## Repository Layout

- `dcf-cfp-module/` - Next.js workflow app, schemas, API routes, and tests
- `v5.5_DCF/` - final prompt workflow specification
- `dcf-cfp-module/test/fixtures/` - small sanitized fixtures for deterministic tests

## Publishing Notes

Before pushing to a public GitHub repository, confirm:

- no `.env` files are present
- no raw PDF/XLSX/HTML filings are present
- no handoff, onboarding, or company-internal documents are present
- Git remote points to the new personal repository, not the original transferred repository
