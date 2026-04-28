# DCF Valuation Tool Workflow Audit Summary

Date: 2026-04-24

## Current Status

The app has been advanced from a Step 1-7 cash-flow/WACC workflow into an 8-step workflow:

1. Company Profile and Business Architecture
2. Historical Financials
3. Competitive Landscape
4. Synergies and Capital Allocation
5. Forecast
6. Executive Summary and Export
7. WACC
8. DCF Valuation Dashboard and business decision

The current implementation is artifact-first: downstream steps prefer validated v5.5 structured artifacts over legacy UI-only projections.

## What Changed Today

### Step 1

- Added/validated v5.5 structured profile output with `reported_view`, `analysis_view`, `claims`, and `sources`.
- Added review state and approval edits.
- Added ticker propagation into profile state.
- Added Gemini-safe structured output handling and schema tests.

### Step 2

- Added structured historical financial rows and review-aware parsing.
- Added confirmed-year handling and baseline re-anchor support.
- Added fixture ingestion for Apple FY2021-FY2025 demo data.
- Added a clean demo package at `test/fixtures/step2/apple-demo-dcf/`, including:
  - `apple-fy2021-fy2025-complete-dcf-input.json`
  - CSV/XLSX total-company history
  - matching Step 1 architecture

### Step 3

- Added v5.5 competition artifact parsing and review state.
- Added normalization for common Porter-force key aliases and human-readable labels.
- Added review-gated defaults when a model omits Porter forces.
- Added fallback source IDs and snippet truncation to avoid hard schema failures.

### Step 4

- Added v5.5 synergy/capital artifact parsing and review state.
- Added source-snippet truncation.
- Added normalization for multi-id capital synergy links so the workflow goes to review instead of failing.

### Step 5

- Added v5.5 `machine_artifact` forecast output and Gemini-safe schema handling.
- Added Step 2 baseline re-anchor.
- Added normalization for composite driver-quality labels.
- Preserved the existing quarterly projection UI while making the annual artifact the source of truth.

### Step 6

- Changed aggregation to prefer Step 5 structured annual artifacts over legacy product projections.
- Added export/audit support for:
  - annual consolidated forecast
  - segment forecast
  - assumption registry
  - weak-inference sensitivity
  - review warnings and audit flags
  - synergy/capital data
  - quarterly working sheets

### Step 7

- Made ticker input editable.
- Added ticker recovery from company name/profile.
- Made WACC save write ticker back to profile.
- Added `currentPrice`, `sharesOutstanding`, and `totalCash` to WACC market data for a better equity bridge.

### Step 8

- Added a new final DCF Valuation Dashboard.
- Added DCF valuation helper using Step 5 approved forecast and Step 7 saved WACC.
- Added FCFF bridge, terminal value, enterprise value, net debt, equity value, intrinsic value per share, and model decision.
- Added business decision labels:
  - Buy / Accumulate
  - Watch / Hold
  - Avoid / Do Not Buy
  - Insufficient Data
- Added sanity checks for:
  - apparent USD billions forecast values
  - WACC <= terminal growth
  - missing cash data
  - missing forecast/WACC inputs
- Fixed absolute fiscal year handling so `2026-2030` or `FY2026-FY2030` map correctly to FY1-FY5.
- Fixed the baseline-year bug where FY2025 baseline could be treated as FY1 when a six-year artifact included baseline plus five forecast years.

## Known Issues / Remaining Risks

- The frontend has not yet been fully browser-regression-tested across all 8 steps after the final Step 8 changes.
- Full project lint still has historical unrelated lint issues in files outside the recently touched validation set; related lint for changed files passed.
- Step 8 market sanity text uses public references but is still static UI copy. A future improvement should store external valuation references as a structured audit artifact.
- The WACC route depends on Yahoo Finance fields; `interestExpense` may come back as 0 for some tickers and should remain reviewable.
- The Apple demo is total-company clean, while some product/category fixtures intentionally lack operating income because Apple does not disclose it at that level.

## Validation Run

- `node node_modules/typescript/bin/tsc --noEmit`
- Related ESLint on changed workflow/valuation files
- Related tests for aggregation, WACC handoff, and DCF valuation
- `npm test`

Latest full test result: 73 passing tests.

