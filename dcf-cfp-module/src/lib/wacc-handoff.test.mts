import test from "node:test";
import assert from "node:assert/strict";

import { buildWaccSegmentsFromCFP } from "./wacc-handoff.ts";
import type { BusinessArchitecture, ForecastState, Step5StructuredResult } from "../types/cfp.ts";

const architecture: BusinessArchitecture = {
  architecture: [
    { segment: "Hardware Products", businessLines: [] },
    { segment: "Services", businessLines: [] },
  ],
  sources: [],
};

function artifact(segment: string, fy5: number): Step5StructuredResult {
  return {
    schema_version: "v5.5",
    company_name: "Apple",
    review_summary: {
      one_line: "Ready.",
      highlights: [],
      warnings: [],
    },
    machine_artifact: {
      forecast_mode: "SEGMENT_ANNUAL",
      assumptions: [
        {
          id: "A1",
          statement: "Disclosed baseline growth.",
          basis_claim_ids: ["S2-C1"],
          driver_quality: "DISCLOSED",
          driver_eligibility_source: "Step 2.",
          arithmetic_trace: "FY+5 from Step 5 artifact.",
          management_override_required: false,
        },
      ],
      forecast_table: [1, 2, 3, 4, 5].map((year) => ({
        segment,
        category: "Segment Forecast",
        product: null,
        fiscal_year: `FY+${year}`,
        quarter: null,
        revenue_low_usd_m: year === 5 ? fy5 * 0.95 : 100,
        revenue_base_usd_m: year === 5 ? fy5 : 100,
        revenue_high_usd_m: year === 5 ? fy5 * 1.05 : 100,
        yoy_growth_pct: 5,
        assumption_ids: ["A1"],
        driver_quality: "DISCLOSED",
        flags: [],
      })),
      weak_inference_sensitivity: [],
      confidence_summary: {
        total_fy5_revenue_base_usd_m: fy5,
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

test("builds WACC import rows from Step 5 structured FY5 artifacts before legacy projection", () => {
  const forecast: ForecastState = {
    approved: true,
    structuredResults: [artifact("Products", 307003), artifact("Services", 109158)],
    segments: [
      {
        segment: "Hardware Products",
        products: [
          {
            productName: "Legacy row should not win",
            categoryName: "Legacy",
            forecast: Array.from({ length: 20 }, (_, index) => ({
              year: Math.floor(index / 4) + 1,
              quarter: `Q${(index % 4) + 1}`,
              revenueM: 1,
              yoyGrowth: 0,
              strategicDriver: "legacy",
            })),
          },
        ],
      },
    ],
  };

  const rows = buildWaccSegmentsFromCFP(architecture, forecast, (segment) => `id-${segment}`);

  assert.equal(rows[0].name, "Hardware Products");
  assert.equal(rows[0].estimatedValue, 307003);
  assert.equal(rows[1].name, "Services");
  assert.equal(rows[1].estimatedValue, 109158);
});
