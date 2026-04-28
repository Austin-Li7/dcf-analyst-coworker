import test from "node:test";
import assert from "node:assert/strict";

import {
  aggregateMasterForecast,
  buildStep5AssumptionRows,
  buildStep5ReviewWarningRows,
  buildStep5WeakSensitivityRows,
} from "./aggregate-forecast.ts";
import type { ForecastState, Step5StructuredResult } from "../types/cfp.ts";

function step5Artifact(segment: string, values: number[]): Step5StructuredResult {
  return {
    schema_version: "v5.5",
    company_name: "Example Inc.",
    review_summary: {
      one_line: `${segment} ready with one weak driver isolated.`,
      highlights: [`${segment} annual source of truth retained.`],
      warnings: [`${segment} weak driver requires review.`],
    },
    machine_artifact: {
      forecast_mode: "SEGMENT_ANNUAL",
      assumptions: [
        {
          id: `${segment}-A1`,
          statement: `${segment} growth follows disclosed baseline.`,
          basis_claim_ids: ["S2-C1"],
          driver_quality: "DISCLOSED",
          driver_eligibility_source: "Step 2 disclosed history.",
          arithmetic_trace: "FY+1 = baseline * (1 + growth).",
          management_override_required: false,
        },
        {
          id: `${segment}-A2`,
          statement: `${segment} weak uplift is capped.`,
          basis_claim_ids: ["S4-C1"],
          driver_quality: "WEAK",
          driver_eligibility_source: "Step 4 weak driver sensitivity.",
          arithmetic_trace: "FY5 sensitivity removes weak uplift.",
          management_override_required: true,
        },
      ],
      forecast_table: values.map((value, index) => ({
        segment,
        category: "Segment Forecast",
        product: null,
        fiscal_year: `FY+${index + 1}`,
        quarter: null,
        revenue_low_usd_m: value * 0.95,
        revenue_base_usd_m: value,
        revenue_high_usd_m: value * 1.05,
        yoy_growth_pct: index === 0 ? 5 : 6,
        assumption_ids: index === 4 ? [`${segment}-A1`, `${segment}-A2`] : [`${segment}-A1`],
        driver_quality: index === 4 ? "WEAK" : "DISCLOSED",
        flags: index === 4 ? ["WEAK_INFERENCE_SENSITIVITY"] : [],
      })),
      weak_inference_sensitivity: [
        {
          assumption_id: `${segment}-A2`,
          evidence_level: "WEAK_INFERENCE",
          if_removed_revenue_impact_usd_m: -250,
          fy5_impact_pct: -2.5,
          flag: "REVIEW_REQUIRED",
        },
      ],
      confidence_summary: {
        total_fy5_revenue_base_usd_m: values[4],
        disclosed_driver_revenue_pct: 75,
        strong_driver_revenue_pct: 15,
        weak_driver_revenue_pct: 10,
        high_uncertainty_flags: 1,
      },
      workflow_status: "NEEDS_REVIEW",
      next_action: "HUMAN_REVIEW_MAJOR_ASSUMPTION",
    },
  };
}

test("aggregates Step 6 rows from Step 5 structured artifacts before legacy product projections", () => {
  const forecast: ForecastState = {
    approved: true,
    structuredResults: [
      step5Artifact("Products", [100, 110, 120, 130, 140]),
      step5Artifact("Services", [50, 60, 70, 80, 90]),
    ],
    segments: [
      {
        segment: "Products",
        products: [
          {
            productName: "Legacy Products projection",
            categoryName: "Legacy",
            forecast: Array.from({ length: 20 }, (_, index) => ({
              year: Math.floor(index / 4) + 1,
              quarter: `Q${(index % 4) + 1}`,
              revenueM: 1,
              yoyGrowth: 0,
              strategicDriver: "legacy projection should not drive Step 6",
            })),
          },
        ],
      },
    ],
  };

  const rows = aggregateMasterForecast(forecast);
  const total = rows.find((row) => row.isTotal);

  assert.equal(total?.fy1, 150);
  assert.equal(total?.fy5, 230);
  assert.equal(rows.some((row) => row.category === "Legacy"), false);
});

test("maps absolute fiscal years in Step 5 artifacts to FY1-FY5 instead of dropping them", () => {
  const forecast: ForecastState = {
    approved: true,
    segments: [],
    structuredResults: [
      {
        ...step5Artifact("Products", [100, 110, 120, 130, 140]),
        machine_artifact: {
          ...step5Artifact("Products", [100, 110, 120, 130, 140]).machine_artifact,
          forecast_table: [2026, 2027, 2028, 2029, 2030].map((year, index) => ({
            segment: "Products",
            category: "Segment Forecast",
            product: null,
            fiscal_year: String(year),
            quarter: null,
            revenue_low_usd_m: [100, 110, 120, 130, 140][index] * 0.95,
            revenue_base_usd_m: [100, 110, 120, 130, 140][index],
            revenue_high_usd_m: [100, 110, 120, 130, 140][index] * 1.05,
            yoy_growth_pct: 5,
            assumption_ids: ["Products-A1"],
            driver_quality: "DISCLOSED",
            flags: [],
          })),
        },
      },
      {
        ...step5Artifact("Services", [50, 60, 70, 80, 90]),
        machine_artifact: {
          ...step5Artifact("Services", [50, 60, 70, 80, 90]).machine_artifact,
          forecast_table: [2026, 2027, 2028, 2029, 2030].map((year, index) => ({
            segment: "Services",
            category: "Segment Forecast",
            product: null,
            fiscal_year: `FY${year}`,
            quarter: null,
            revenue_low_usd_m: [50, 60, 70, 80, 90][index] * 0.95,
            revenue_base_usd_m: [50, 60, 70, 80, 90][index],
            revenue_high_usd_m: [50, 60, 70, 80, 90][index] * 1.05,
            yoy_growth_pct: 5,
            assumption_ids: ["Services-A1"],
            driver_quality: "DISCLOSED",
            flags: [],
          })),
        },
      },
    ],
  };

  const total = aggregateMasterForecast(forecast).find((row) => row.isTotal);

  assert.equal(total?.fy1, 150);
  assert.equal(total?.fy2, 170);
  assert.equal(total?.fy5, 230);
});

test("drops an included baseline fiscal year when absolute Step 5 artifacts contain six years", () => {
  const forecast: ForecastState = {
    approved: true,
    segments: [],
    structuredResults: [
      {
        ...step5Artifact("Products", [100, 110, 120, 130, 140]),
        machine_artifact: {
          ...step5Artifact("Products", [100, 110, 120, 130, 140]).machine_artifact,
          forecast_table: [2026, 2027, 2028, 2029, 2030].map((year, index) => ({
            segment: "Products",
            category: "Segment Forecast",
            product: null,
            fiscal_year: String(year),
            quarter: null,
            revenue_low_usd_m: [300, 315, 331, 348, 365][index] * 0.95,
            revenue_base_usd_m: [300, 315, 331, 348, 365][index],
            revenue_high_usd_m: [300, 315, 331, 348, 365][index] * 1.05,
            yoy_growth_pct: 5,
            assumption_ids: ["Products-A1"],
            driver_quality: "DISCLOSED",
            flags: [],
          })),
        },
      },
      {
        ...step5Artifact("Services", [100, 110, 120, 130, 140]),
        machine_artifact: {
          ...step5Artifact("Services", [100, 110, 120, 130, 140]).machine_artifact,
          forecast_table: [2025, 2026, 2027, 2028, 2029, 2030].map((year, index) => ({
            segment: "Services",
            category: "Segment Forecast",
            product: null,
            fiscal_year: `FY${year}`,
            quarter: null,
            revenue_low_usd_m: [104, 110, 118, 126, 135, 145][index] * 0.95,
            revenue_base_usd_m: [104, 110, 118, 126, 135, 145][index],
            revenue_high_usd_m: [104, 110, 118, 126, 135, 145][index] * 1.05,
            yoy_growth_pct: 5,
            assumption_ids: ["Services-A1"],
            driver_quality: "DISCLOSED",
            flags: year === 2025 ? ["ESTIMATED_BASELINE"] : [],
          })),
        },
      },
    ],
  };

  const total = aggregateMasterForecast(forecast).find((row) => row.isTotal);

  assert.equal(total?.fy1, 410);
  assert.equal(total?.fy2, 433);
  assert.equal(total?.fy5, 510);
});

test("builds Step 6 artifact audit rows for assumptions, weak sensitivity, and warnings", () => {
  const forecast: ForecastState = {
    approved: true,
    segments: [],
    structuredResults: [step5Artifact("Services", [50, 60, 70, 80, 90])],
  };

  const assumptions = buildStep5AssumptionRows(forecast);
  const weakSensitivity = buildStep5WeakSensitivityRows(forecast);
  const warnings = buildStep5ReviewWarningRows(forecast);

  assert.equal(assumptions.length, 2);
  assert.equal(assumptions[1].management_override_required, true);
  assert.equal(weakSensitivity[0].assumption_id, "Services-A2");
  assert.equal(warnings.some((row) => row.warning.includes("weak driver")), true);
  assert.equal(warnings.some((row) => row.audit_flag === "WEAK_INFERENCE_SENSITIVITY"), true);
});
