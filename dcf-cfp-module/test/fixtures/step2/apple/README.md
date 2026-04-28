# Apple Step 2 Fixtures

Latest official Step 2 test data pulled on 2026-04-24.

Source:
- Apple Newsroom press release, "Apple reports first quarter results", published 2026-01-29: https://www.apple.com/newsroom/2026/01/apple-reports-first-quarter-results/
- Apple FY2026 Q1 consolidated financial statements PDF: https://www.apple.com/newsroom/pdfs/fy2026-q1/FY26_Q1_Consolidated_Financial_Statements.pdf

Files:
- `apple-fy2026-q1-consolidated-financial-statements.pdf`: official Apple PDF source.
- `apple-fy2026-q1-step2-source.csv`: upload-ready Step 2 CSV source data.
- `apple-fy2026-q1-step2-notes.txt`: paste-ready Step 2 text notes.
- `apple-step1-architecture-v55.json`: minimal Step 1 v5.5 canonical architecture input for Step 2 extraction tests.
- `apple-fy2026-q1-expected-step2-structured-result.json`: expected structured Step 2 result for schema/API fixture tests.
- `apple-fy2021-fy2025-step2-full-history.csv`: upload-ready five-year fixture with FY2021-FY2025 quarterly category net sales.
- `apple-fy2021-fy2025-step2-full-history.xlsx`: Excel version of the five-year upload fixture.
- `apple-fy2021-fy2025-expected-step2-structured-results-by-year.json`: v5.5 expected structured results keyed by target fiscal year.

Fixture intent:
- Revenue rows by product category should map to Step 1 canonical offerings.
- Geographic reportable-segment rows should be excluded.
- Category-level operating income is not disclosed; structured rows should keep `operating_income_usd_m` as `null`.

How to use the five-year fixture in the app:
1. Complete Step 1 so the app has a v5.5 structured architecture.
2. In Step 2, upload `apple-fy2021-fy2025-step2-full-history.csv` or `.xlsx`.
3. Enter one target fiscal year at a time, such as `2021`, extract, review, and confirm.
4. Repeat for FY2022-FY2025. The Step 2 UI currently confirms one target year per extraction, even when the uploaded file contains all five years.
