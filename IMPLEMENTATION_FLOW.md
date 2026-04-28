# Implementation Flow

This project was created as an AI-assisted valuation workflow prototype.

## 1. Prompt System Design

The starting point was a multi-step DCF research process. I converted it into a v5.5 workflow with explicit contracts for:

- company business architecture
- historical financial extraction
- competitive landscape
- synergy and capital allocation analysis
- forecast construction
- WACC and valuation audit

Each step was designed to produce a structured artifact instead of only prose.

## 2. Structured Artifact Layer

The app uses typed schemas to make model output reviewable and reusable. The key pattern is:

- machine-readable artifact for downstream automation
- reviewer summary for human validation
- UI handoff for the next workflow step

This reduces prompt drift and lets later valuation steps consume approved data instead of raw chat text.

## 3. Interactive Workflow Prototype

The interactive Next.js app was developed with coding-agent assistance. The UI should be treated as an AI-assisted prototype implementation.

The important product logic is the workflow shape:

- collect or generate source-grounded inputs
- parse responses into schemas
- expose review checkpoints
- preserve approved structured state
- generate exports and valuation views

## 4. Data Ingestion Direction

The original working version used uploaded public-company filings and spreadsheet fixtures. For a cleaner portfolio demo, raw PDF/XLSX/HTML materials are removed.

The intended public-demo flow is:

1. enter ticker
2. fetch SEC company facts and filing metadata
3. fetch market data through Yahoo Finance
4. build a reviewable DCF input package
5. run the existing structured workflow

The portfolio cleanup adds `GET /api/bootstrap-company?ticker=...` as the first backend slice of that direction. It fetches SEC Company Facts at runtime and builds a lightweight baseline package instead of committing raw filings.

## 5. Verification

The project includes Node tests for schemas, normalization, fixture ingestion, WACC handoff, aggregation, and valuation math.

Run:

```bash
cd dcf-cfp-module
npm test
npm run lint
npm run build
```
