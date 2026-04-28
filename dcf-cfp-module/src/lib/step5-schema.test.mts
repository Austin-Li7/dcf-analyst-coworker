import test from "node:test";
import assert from "node:assert/strict";

import {
  GEMINI_STEP5_RESPONSE_SCHEMA,
  STEP5_RESPONSE_SCHEMA,
  Step5StructuredSchema,
  buildStep5BaselineContext,
  parseStep5StructuredResult,
  projectStep5StructuredToProducts,
  reanchorStep5ForecastToBaselines,
} from "./step5-schema.ts";

const fixture = {
  schema_version: "v5.5",
  company_name: "Apple",
  review_summary: {
    one_line: "Segment annual forecast is ready with one weak driver isolated.",
    highlights: ["Services grows from disclosed historical baseline."],
    warnings: ["One weak assumption requires sensitivity review."],
  },
  machine_artifact: {
    forecast_mode: "SEGMENT_ANNUAL",
    assumptions: [
      {
        id: "A001",
        statement: "Services base growth starts at 10%.",
        basis_claim_ids: ["S2-C1", "S3-C1"],
        driver_quality: "STRONG",
        driver_eligibility_source: "Historical trend and competition review.",
        arithmetic_trace: "FY+1 base = latest annual Services revenue * 1.10",
        management_override_required: false,
      },
      {
        id: "A002",
        statement: "Device ecosystem adds capped contribution.",
        basis_claim_ids: ["S4-C1"],
        driver_quality: "WEAK",
        driver_eligibility_source: "Step 4 driver eligibility capped at 2pp.",
        arithmetic_trace: "Weak driver sensitivity removes 2pp from growth path.",
        management_override_required: true,
      },
    ],
    forecast_table: [
      {
        segment: "Services",
        category: "Segment Forecast",
        fiscal_year: "FY+1",
        revenue_low_usd_m: 101000,
        revenue_base_usd_m: 104000,
        revenue_high_usd_m: 107000,
        yoy_growth_pct: 10,
        assumption_ids: ["A001"],
        driver_quality: "STRONG",
        flags: [],
      },
      {
        segment: "Services",
        category: "Segment Forecast",
        fiscal_year: "FY+2",
        revenue_low_usd_m: 109000,
        revenue_base_usd_m: 114400,
        revenue_high_usd_m: 119000,
        yoy_growth_pct: 10,
        assumption_ids: ["A001", "A002"],
        driver_quality: "WEAK",
        flags: ["WEAK_INFERENCE_SENSITIVITY"],
      },
    ],
    weak_inference_sensitivity: [
      {
        assumption_id: "A002",
        evidence_level: "WEAK_INFERENCE",
        if_removed_revenue_impact_usd_m: -2100,
        fy5_impact_pct: -2.1,
        flag: "REVIEW_REQUIRED",
      },
    ],
    confidence_summary: {
      total_fy5_revenue_base_usd_m: 142000,
      disclosed_driver_revenue_pct: 70,
      strong_driver_revenue_pct: 20,
      weak_driver_revenue_pct: 10,
      high_uncertainty_flags: 1,
    },
    workflow_status: "NEEDS_REVIEW",
    next_action: "HUMAN_REVIEW_MAJOR_ASSUMPTION",
  },
};

test("parses Step 5 v5.5 machine artifact and validates assumption links", () => {
  const parsed = Step5StructuredSchema.parse(fixture);

  assert.equal(parsed.schema_version, "v5.5");
  assert.equal(parsed.machine_artifact.forecast_mode, "SEGMENT_ANNUAL");
  assert.equal(parsed.machine_artifact.forecast_table[1].assumption_ids[1], "A002");
  assert.equal(parsed.machine_artifact.workflow_status, "NEEDS_REVIEW");
});

test("rejects forecast rows that cite undeclared assumptions", () => {
  const payload = structuredClone(fixture);
  payload.machine_artifact.forecast_table[0].assumption_ids = ["A999"];

  assert.throws(() => Step5StructuredSchema.parse(payload));
});

test("normalizes legacy schema_version values during API parsing", () => {
  const payload = structuredClone(fixture);
  payload.schema_version = "5.0";

  const parsed = parseStep5StructuredResult(payload);

  assert.equal(parsed.schema_version, "v5.5");
});

test("normalizes model enum typos in Step 5 driver quality", () => {
  const payload = structuredClone(fixture);
  payload.machine_artifact.forecast_table[0].driver_quality = "ESTIMATED_-BASE";
  payload.machine_artifact.assumptions[0].driver_quality = "ESTIMATED BASE";

  const parsed = parseStep5StructuredResult(payload);

  assert.equal(parsed.machine_artifact.forecast_table[0].driver_quality, "ESTIMATED_BASE");
  assert.equal(parsed.machine_artifact.assumptions[0].driver_quality, "ESTIMATED_BASE");
});

test("normalizes composite Step 5 driver quality labels to conservative reviewable values", () => {
  const payload = structuredClone(fixture);
  payload.machine_artifact.forecast_table[0].driver_quality = "ESTIMATED_BASE_STRONG_WEAK";
  payload.machine_artifact.forecast_table[1].driver_quality = "STRONG_WEAK";
  payload.machine_artifact.assumptions[0].driver_quality = "strong/weak";

  const parsed = parseStep5StructuredResult(payload);

  assert.equal(parsed.machine_artifact.forecast_table[0].driver_quality, "WEAK");
  assert.equal(parsed.machine_artifact.forecast_table[1].driver_quality, "WEAK");
  assert.equal(parsed.machine_artifact.assumptions[0].driver_quality, "WEAK");
  assert.equal(parsed.machine_artifact.workflow_status, "NEEDS_REVIEW");
  assert.equal(
    parsed.review_summary.warnings.some((warning) =>
      warning.includes("MODEL_COMPOSITE_DRIVER_QUALITY"),
    ),
    true,
  );
});

test("projects segment annual artifact to legacy 20-quarter product rows", () => {
  const parsed = parseStep5StructuredResult(fixture);
  const products = projectStep5StructuredToProducts(parsed, "Services");

  assert.equal(products.length, 1);
  assert.equal(products[0].productName, "Services segment base case");
  assert.equal(products[0].categoryName, "Segment Forecast");
  assert.equal(products[0].forecast.length, 20);
  assert.equal(products[0].forecast[0].revenueM, 26000);
  assert.equal(products[0].forecast[4].revenueM, 28600);
  assert.match(products[0].forecast[4].strategicDriver, /A001/);
  assert.match(products[0].forecast[4].strategicDriver, /A002/);
});

test("exports a Step 5 response schema for structured LLM output", () => {
  assert.equal(typeof STEP5_RESPONSE_SCHEMA, "object");
  assert.equal((STEP5_RESPONSE_SCHEMA as Record<string, unknown>).type, "object");
});

test("exports a Gemini-safe Step 5 response schema without unsupported keywords", () => {
  const serialized = JSON.stringify(GEMINI_STEP5_RESPONSE_SCHEMA);

  assert.equal(serialized.includes("\"$ref\""), false);
  assert.equal(serialized.includes("\"const\""), false);
  assert.equal(serialized.includes("\"additionalProperties\""), false);
  assert.equal(serialized.includes("\"type\":[\"number\",\"null\"]"), false);
  assert.equal(serialized.includes("\"type\":[\"string\",\"null\"]"), false);
});

test("builds Step 5 baseline context from latest disclosed Products and Services rows", () => {
  const baselines = buildStep5BaselineContext(
    {
      rows: [
        {
          id: "r1",
          fiscalYear: 2025,
          quarter: "Q4",
          segment: "Products",
          productCategory: "Products",
          productName: "Products",
          revenue: 307003,
          yoyGrowth: 4,
          operatingIncome: null,
          notes: "Official FY2025 Products net sales.",
        },
        {
          id: "r2",
          fiscalYear: 2025,
          quarter: "Q4",
          segment: "Services",
          productCategory: "Services",
          productName: "Services",
          revenue: 109158,
          yoyGrowth: 14,
          operatingIncome: null,
          notes: "Official FY2025 Services net sales.",
        },
      ],
      confirmedYears: [2025],
    },
    ["Hardware Products", "Services"],
  );

  assert.equal(baselines[0].targetSegment, "Hardware Products");
  assert.equal(baselines[0].baselineRevenueUsdM, 307003);
  assert.equal(baselines[0].matchQuality, "disclosed_alias");
  assert.equal(baselines[1].targetSegment, "Services");
  assert.equal(baselines[1].baselineRevenueUsdM, 109158);
});

test("builds Step 5 baseline context from Step 2 structured artifacts before legacy rows", () => {
  const baselines = buildStep5BaselineContext(
    {
      rows: [
        {
          id: "stale-services",
          fiscalYear: 2025,
          quarter: "Q4",
          segment: "Services",
          productCategory: "Services",
          productName: "Services",
          revenue: 1,
          yoyGrowth: 0,
          operatingIncome: null,
          notes: "Stale legacy projection row.",
        },
      ],
      confirmedYears: [2025],
      structuredResults: [
        {
          schema_version: "v5.5",
          company_name: "Apple",
          target_year: 2025,
          rows: [
            {
              row_id: "s2-services",
              fiscal_year: 2025,
              quarter: "Q4",
              segment: "Services",
              product_category: "Services",
              product_name: "Services",
              revenue_usd_m: 109158,
              operating_income_usd_m: null,
              mapped_from_step1_ids: ["seg-services"],
              source_id: "src-1",
              evidence_level: "DISCLOSED",
              validation_status: "verified_source",
              review_note: "Official FY2025 Services net sales.",
            },
          ],
          sources: [
            {
              source_id: "src-1",
              source_type: "uploaded_file",
              name: "10-K",
              locator: "FY2025",
              excerpt: "Services net sales",
            },
          ],
          excluded_items: [],
          validation_warnings: [],
          review_summary: {
            one_line: "Structured Step 2 artifact approved.",
            highlights: [],
            warnings: [],
          },
        },
      ],
    },
    ["Services"],
  );

  assert.equal(baselines.length, 1);
  assert.equal(baselines[0].baselineRevenueUsdM, 109158);
  assert.equal(baselines[0].sourceLabel, "Services");
});

test("builds Hardware Products baseline by summing disclosed product category rows", () => {
  const baselines = buildStep5BaselineContext(
    {
      rows: [
        {
          id: "iphone",
          fiscalYear: 2025,
          quarter: "Q4",
          segment: "Hardware Products",
          productCategory: "iPhone",
          productName: "iPhone",
          revenue: 209586,
          yoyGrowth: 4,
          operatingIncome: null,
          notes: "Official FY2025 iPhone net sales.",
        },
        {
          id: "mac",
          fiscalYear: 2025,
          quarter: "Q4",
          segment: "Hardware Products",
          productCategory: "Mac",
          productName: "Mac",
          revenue: 33708,
          yoyGrowth: 12,
          operatingIncome: null,
          notes: "Official FY2025 Mac net sales.",
        },
        {
          id: "ipad",
          fiscalYear: 2025,
          quarter: "Q4",
          segment: "Hardware Products",
          productCategory: "iPad",
          productName: "iPad",
          revenue: 28023,
          yoyGrowth: 5,
          operatingIncome: null,
          notes: "Official FY2025 iPad net sales.",
        },
        {
          id: "wearables",
          fiscalYear: 2025,
          quarter: "Q4",
          segment: "Hardware Products",
          productCategory: "Wearables, Home and Accessories",
          productName: "Wearables, Home and Accessories",
          revenue: 35686,
          yoyGrowth: -4,
          operatingIncome: null,
          notes: "Official FY2025 Wearables net sales.",
        },
        {
          id: "services",
          fiscalYear: 2025,
          quarter: "Q4",
          segment: "Services",
          productCategory: "Services",
          productName: "Services",
          revenue: 109158,
          yoyGrowth: 14,
          operatingIncome: null,
          notes: "Official FY2025 Services net sales.",
        },
      ],
      confirmedYears: [2025],
    },
    ["Hardware Products"],
  );

  assert.equal(baselines.length, 1);
  assert.equal(baselines[0].baselineRevenueUsdM, 307003);
  assert.equal(baselines[0].matchQuality, "disclosed_sum");
});

test("defaults missing Step 5 workflow fields to review-gated fallback", () => {
  const payload = structuredClone(fixture);
  delete (payload.machine_artifact as Record<string, unknown>).workflow_status;
  delete (payload.machine_artifact as Record<string, unknown>).next_action;

  const parsed = parseStep5StructuredResult(payload);

  assert.equal(parsed.machine_artifact.workflow_status, "NEEDS_REVIEW");
  assert.equal(parsed.machine_artifact.next_action, "HUMAN_REVIEW_MAJOR_ASSUMPTION");
  assert.equal(
    parsed.review_summary.warnings.some((warning) =>
      warning.includes("MODEL_OMITTED_WORKFLOW_STATUS"),
    ),
    true,
  );
});

test("reanchors annual Step 5 forecast rows to disclosed Step 2 baseline", () => {
  const parsed = parseStep5StructuredResult({
    ...fixture,
    machine_artifact: {
      ...fixture.machine_artifact,
      forecast_table: [
        {
          segment: "Hardware Products",
          category: "Segment Forecast",
          fiscal_year: "FY+1",
          revenue_low_usd_m: 245000,
          revenue_base_usd_m: 254694,
          revenue_high_usd_m: 260000,
          yoy_growth_pct: 2,
          assumption_ids: ["A001"],
          driver_quality: "ESTIMATED_BASE",
          flags: ["ESTIMATED_BASELINE"],
        },
        {
          segment: "Hardware Products",
          category: "Segment Forecast",
          fiscal_year: "FY+2",
          revenue_low_usd_m: 250000,
          revenue_base_usd_m: 259788,
          revenue_high_usd_m: 266000,
          yoy_growth_pct: 2,
          assumption_ids: ["A001"],
          driver_quality: "ESTIMATED_BASE",
          flags: ["ESTIMATED_BASELINE"],
        },
      ],
    },
  });

  const reanchored = reanchorStep5ForecastToBaselines(parsed, [
    {
      targetSegment: "Hardware Products",
      baselineFiscalYear: 2025,
      baselineRevenueUsdM: 307003,
      matchQuality: "disclosed_alias",
      sourceLabel: "Products",
    },
  ]);

  const [fy1, fy2] = reanchored.machine_artifact.forecast_table;

  assert.equal(Math.round(fy1.revenue_base_usd_m), 313143);
  assert.equal(Math.round(fy2.revenue_base_usd_m), 319406);
  assert.equal(fy1.flags.includes("BASELINE_REANCHORED_TO_STEP2"), true);
  assert.match(fy1.assumption_ids.join(","), /A001/);
});

test("projects Products rows when the requested segment is Hardware Products", () => {
  const parsed = parseStep5StructuredResult({
    ...fixture,
    machine_artifact: {
      ...fixture.machine_artifact,
      forecast_table: [
        {
          segment: "Products",
          category: "Segment Forecast",
          fiscal_year: "FY+1",
          revenue_low_usd_m: 300000,
          revenue_base_usd_m: 313143,
          revenue_high_usd_m: 320000,
          yoy_growth_pct: 2,
          assumption_ids: ["A001"],
          driver_quality: "DISCLOSED",
          flags: [],
        },
      ],
    },
  });

  const products = projectStep5StructuredToProducts(parsed, "Hardware Products");

  assert.equal(products.length, 1);
  assert.equal(products[0].forecast[0].revenueM, 78285.8);
});
