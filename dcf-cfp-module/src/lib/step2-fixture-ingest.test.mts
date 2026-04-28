import test from "node:test";
import assert from "node:assert/strict";

import {
  buildStep2StructuredFromFixtureRecords,
  recordsFromDcfInputPayload,
  summarizeDcfInputPayload,
} from "./step2-fixture-ingest.ts";

test("imports standard Step 2 fixture rows deterministically for one fiscal year", () => {
  const result = buildStep2StructuredFromFixtureRecords(
    [
      {
        source_name: "Apple FY2025 Q4",
        source_url: "https://www.apple.com/newsroom/",
        fiscal_year: 2025,
        quarter: "Q4",
        segment: "Total Company",
        product_category: "Total Company",
        product_name: "Apple Inc.",
        revenue_usd_m: 102466,
        operating_income_usd_m: 32427,
        mapped_from_step1_ids: "segment:total-company;offering:apple-inc",
        validation_status: "verified_source",
        review_note: "Directly disclosed.",
      },
      {
        source_name: "Apple FY2024 Q4",
        source_url: "https://www.apple.com/newsroom/",
        fiscal_year: 2024,
        quarter: "Q4",
        segment: "Total Company",
        product_category: "Total Company",
        product_name: "Apple Inc.",
        revenue_usd_m: 94930,
        operating_income_usd_m: 29591,
        mapped_from_step1_ids: "segment:total-company;offering:apple-inc",
      },
    ],
    2025,
    "demo.csv",
  );

  assert.ok(result);
  assert.equal(result.target_year, 2025);
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].revenue_usd_m, 102466);
  assert.equal(result.rows[0].operating_income_usd_m, 32427);
  assert.deepEqual(result.rows[0].mapped_from_step1_ids, [
    "segment:total-company",
    "offering:apple-inc",
  ]);
  assert.equal(result.sources.length, 1);
  assert.equal(result.validation_warnings.length, 0);
});

test("returns null for non-standard uploaded records", () => {
  const result = buildStep2StructuredFromFixtureRecords(
    [{ fiscal_year: 2025, revenue: 123 }],
    2025,
    "raw.csv",
  );

  assert.equal(result, null);
});

test("extracts Step 2 rows from a complete DCF input JSON payload", () => {
  const payload = {
    historical_quarterly_baseline: {
      rows: [
        {
          source_name: "Apple FY2025 Q4",
          source_url: "https://www.apple.com/newsroom/",
          fiscal_year: 2025,
          quarter: "Q4",
          segment: "Total Company",
          product_category: "Total Company",
          product_name: "Apple Inc.",
          revenue_usd_m: 102466,
          operating_income_usd_m: 32427,
        },
      ],
    },
    historical_annual_dcf_drivers: [{ fiscal_year: 2025 }],
    normalized_base_year: {
      fiscal_year: 2025,
      revenue_usd_m: 416161,
      ebit_usd_m: 133050,
      free_cash_flow_usd_m: 98767,
      cash_and_marketable_securities_usd_m: 132420,
      total_debt_usd_m: 98657,
      common_shares_outstanding_m: 14773,
    },
    forecast_seed_assumptions: { forecast_years: 5 },
    valuation_assumptions: { wacc: 0.085, terminal_growth_rate: 0.025 },
    minimum_dcf_readiness_checklist: { historical_revenue: true },
  };
  const records = recordsFromDcfInputPayload(payload);
  const summary = summarizeDcfInputPayload(payload);

  const result = buildStep2StructuredFromFixtureRecords(records, 2025, "complete-dcf.json");

  assert.equal(records.length, 1);
  assert.ok(summary);
  assert.equal(summary.quarterlyRows, 1);
  assert.equal(summary.annualDriverYears, 1);
  assert.equal(summary.baseYearFiscalYear, 2025);
  assert.equal(summary.hasForecastAssumptions, true);
  assert.equal(summary.hasValuationAssumptions, true);
  assert.ok(result);
  assert.equal(result.rows[0].revenue_usd_m, 102466);
  assert.equal(result.rows[0].operating_income_usd_m, 32427);
});
