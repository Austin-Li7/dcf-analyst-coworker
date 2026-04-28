# Apple DCF Demo Fixture

This folder is the clean demo path for Step 2.

- `apple-fy2021-fy2025-dcf-demo-total-company.xlsx`: upload this in Step 2 to import five complete fiscal years of Apple quarterly total-company net sales and operating income.
- `apple-fy2021-fy2025-dcf-demo-total-company.csv`: same data in CSV form.
- `apple-fy2021-fy2025-complete-dcf-input.json`: full end-to-end DCF demo input package with quarterly baseline, annual DCF drivers, base-year normalization, forecast seed assumptions, WACC/terminal assumptions, and source audit.
- `apple-total-company-step1-architecture-v55.json`: matching Step 1 architecture for a total-company DCF demo.

The data is mechanically aggregated from Apple FY2021-FY2025 quarterly consolidated financial statement fixtures. It uses total-company granularity so every row has both revenue and operating income. This is the recommended fixture for running the demo end to end.

The complete DCF JSON separates filing-grounded historical values from demo assumptions. Historical annual drivers are sourced from the SEC XBRL Company Facts API for Apple Inc. (`CIK0000320193`) and include revenue, EBIT, tax, depreciation and amortization, capex, operating cash flow, free cash flow, cash and marketable securities, debt, working-capital proxy fields, and share count.

Use the older `test/fixtures/step2/apple/apple-fy2021-fy2025-step2-full-history.*` files only when testing product/category mapping. Those files intentionally leave product-level operating income blank because Apple does not disclose operating income at that product-category level.
