import test from "node:test";
import assert from "node:assert/strict";

import { buildDcfValuation } from "./dcf-valuation.ts";
import type { ForecastState, Step5StructuredResult } from "../types/cfp.ts";
import type { WACCState } from "../types/wacc.ts";

function artifact(): Step5StructuredResult {
  return {
    schema_version: "v5.5",
    company_name: "Example",
    review_summary: { one_line: "Ready.", highlights: [], warnings: [] },
    machine_artifact: {
      forecast_mode: "SEGMENT_ANNUAL",
      assumptions: [
        {
          id: "A1",
          statement: "Base growth.",
          basis_claim_ids: ["S2-C1"],
          driver_quality: "DISCLOSED",
          driver_eligibility_source: "Step 2.",
          arithmetic_trace: "Annual forecast.",
          management_override_required: false,
        },
      ],
      forecast_table: [1000, 1100, 1210, 1331, 1464.1].map((value, index) => ({
        segment: "Services",
        category: "Segment Forecast",
        product: null,
        fiscal_year: `FY+${index + 1}`,
        quarter: null,
        revenue_low_usd_m: value * 0.95,
        revenue_base_usd_m: value,
        revenue_high_usd_m: value * 1.05,
        yoy_growth_pct: 10,
        assumption_ids: ["A1"],
        driver_quality: "DISCLOSED",
        flags: [],
      })),
      weak_inference_sensitivity: [],
      confidence_summary: {
        total_fy5_revenue_base_usd_m: 1464.1,
        disclosed_driver_revenue_pct: 100,
        strong_driver_revenue_pct: 0,
        weak_driver_revenue_pct: 0,
        high_uncertainty_flags: 0,
      },
      workflow_status: "READY",
      next_action: "PROCEED_STEP7",
    },
  };
}

const forecast: ForecastState = {
  approved: true,
  segments: [],
  structuredResults: [artifact()],
};

const wacc: WACCState = {
    fetchedData: {
      ticker: "AAPL",
      companyName: "AAPL",
      marketCap: 4_000_000_000,
      currentPrice: 40,
      sharesOutstanding: 100_000_000,
      totalDebt: 10_000_000_000,
      totalCash: 5_000_000_000,
    interestExpense: 0,
    riskFreeRate: 0.04,
    companyDescription: "",
  },
  constants: { riskFreeRate: 0.04, impliedERP: 0.045, marginalTaxRate: 0.21 },
  businessType: "single",
  singleBeta: 1,
  segments: [],
  calculation: {
    deRatio: 0.025,
    unleveredBeta: 1,
    releveredBeta: 1.02,
    costOfEquity: 0.086,
    preTaxCostOfDebt: 0.04,
    afterTaxCostOfDebt: 0.032,
    weightEquity: 0.975,
    weightDebt: 0.025,
    wacc: 0.087,
  },
  saved: true,
};

test("builds DCF valuation from Step 5 annual forecast and WACC", () => {
  const result = buildDcfValuation({
    forecast,
    wacc,
    fcfMargin: 0.25,
    terminalGrowth: 0.025,
  });

  assert.equal(result.hasInputs, true);
  assert.equal(result.forecastRows.length, 5);
  assert.equal(result.forecastRows[0].revenueUsdM, 1000);
  assert.equal(result.forecastRows[0].fcffUsdM, 250);
  assert.equal(result.terminalValueUsdM > result.forecastRows[4].fcffUsdM, true);
  assert.equal(Math.round(result.equityValueUsdM), Math.round(result.enterpriseValueUsdM - 5000));
  assert.equal(result.marketCapUsdM, 4000);
  assert.equal(result.currentPrice, 40);
  assert.notEqual(result.intrinsicValuePerShare, null);
  assert.equal(Math.round(result.intrinsicValuePerShare!), Math.round(result.equityValueUsdM / 100));
  assert.equal((result.impliedUpsidePct ?? 0) < 0, true);
  assert.equal(result.decision.action, "AVOID");
});

test("returns missing-input result when forecast or WACC is unavailable", () => {
  const result = buildDcfValuation({
    forecast: { approved: false, segments: [] },
    wacc: { ...wacc, calculation: null },
    fcfMargin: 0.25,
    terminalGrowth: 0.025,
  });

  assert.equal(result.hasInputs, false);
  assert.equal(result.forecastRows.length, 0);
});

test("normalizes apparent USD billions forecast rows for mega-cap companies before equity bridge", () => {
  const billionScaleForecast: ForecastState = {
    approved: true,
    segments: [],
    structuredResults: [{
      ...artifact(),
      machine_artifact: {
        ...artifact().machine_artifact,
        forecast_table: [475, 508, 535, 560, 585].map((value, index) => ({
          segment: "Consolidated",
          category: "Segment Forecast",
          product: null,
          fiscal_year: `FY+${index + 1}`,
          quarter: null,
          revenue_low_usd_m: value * 0.95,
          revenue_base_usd_m: value,
          revenue_high_usd_m: value * 1.05,
          yoy_growth_pct: 7,
          assumption_ids: ["A1"],
          driver_quality: "DISCLOSED",
          flags: [],
        })),
      },
    }],
  };

  const appleScaleWacc: WACCState = {
    ...wacc,
    fetchedData: {
      ...wacc.fetchedData!,
      marketCap: 3_980_000_000_000,
      totalDebt: 90_510_000_000,
      totalCash: 55_000_000_000,
    },
  };

  const result = buildDcfValuation({
    forecast: billionScaleForecast,
    wacc: appleScaleWacc,
    fcfMargin: 0.25,
    terminalGrowth: 0.025,
  });

  assert.equal(result.hasInputs, true);
  assert.equal(result.forecastRows[0].revenueUsdM, 475000);
  assert.equal(result.revenueScaleFactor, 1000);
  assert.match(result.warnings.join(" "), /converted to USD millions/);
  assert.equal(result.equityValueUsdM > 0, true);
  assert.match(result.decision.summary, /overvalued|undervalued|market value/);
});

test("classifies valuation decision from implied upside thresholds", () => {
  const attractiveWacc: WACCState = {
    ...wacc,
    fetchedData: {
      ...wacc.fetchedData!,
      marketCap: 1_000_000_000,
      totalDebt: 0,
      totalCash: 0,
    },
  };

  const result = buildDcfValuation({
    forecast,
    wacc: attractiveWacc,
    fcfMargin: 0.25,
    terminalGrowth: 0.025,
  });

  assert.equal(result.decision.action, "BUY");
  assert.match(result.decision.summary, /undervalued/i);
});
