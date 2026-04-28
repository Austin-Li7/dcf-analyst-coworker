import test from "node:test";
import assert from "node:assert/strict";

import {
  GEMINI_STEP2_RESPONSE_SCHEMA,
  STEP2_RESPONSE_SCHEMA,
  Step2StructuredSchema,
  parseStep2StructuredResult,
  projectStep2StructuredToRows,
} from "./step2-schema.ts";

const validPayload = {
  schema_version: "v5.5",
  company_name: "Apple Inc.",
  target_year: 2025,
  rows: [
    {
      row_id: "row:2025:q1:products",
      fiscal_year: 2025,
      quarter: "Q1",
      segment: "Products",
      product_category: "Products",
      product_name: "Products",
      revenue_usd_m: 96200,
      operating_income_usd_m: null,
      mapped_from_step1_ids: ["segment:products"],
      source_id: "source:file:apple-q1",
      evidence_level: "DISCLOSED",
      validation_status: "verified_source",
      review_note: "Revenue is directly provided in uploaded source; operating income not disclosed.",
    },
  ],
  sources: [
    {
      source_id: "source:file:apple-q1",
      source_type: "uploaded_file",
      name: "apple-q1.csv",
      locator: "Sheet1 rows 2-4",
      excerpt: "Products, Q1 2025, 96200",
    },
  ],
  excluded_items: [
    {
      label: "Americas geography",
      reason: "Geographic line, not a Step 1 canonical analysis segment.",
      source_id: "source:file:apple-q1",
      evidence_level: "DISCLOSED",
    },
  ],
  validation_warnings: [
    {
      code: "MISSING_OPERATING_INCOME",
      severity: "warn",
      message: "Operating income is not provided for Products.",
      row_ids: ["row:2025:q1:products"],
    },
  ],
  review_summary: {
    one_line: "1 verified revenue row, 1 excluded item, operating income requires review.",
    highlights: ["Products revenue mapped to Step 1 canonical segment."],
    warnings: ["Operating income is missing."],
  },
};

test("parses valid Step 2 structured historical financials and projects legacy rows", () => {
  const parsed = Step2StructuredSchema.parse(validPayload);
  const rows = projectStep2StructuredToRows(parsed);

  assert.equal(parsed.schema_version, "v5.5");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fiscalYear, 2025);
  assert.equal(rows[0].quarter, "Q1");
  assert.equal(rows[0].segment, "Products");
  assert.equal(rows[0].revenue, 96200);
  assert.equal(rows[0].operatingIncome, null);
  assert.equal(rows[0].reviewStatus, "Review Access Data");
  assert.equal(rows[0].internalVerify, "Yes");
});

test("rejects rows without Step 1 mapping provenance", () => {
  const payload = structuredClone(validPayload);
  payload.rows[0].mapped_from_step1_ids = [];

  assert.throws(() => Step2StructuredSchema.parse(payload));
});

test("rejects rows whose source_id is not declared in sources", () => {
  const payload = structuredClone(validPayload);
  payload.rows[0].source_id = "source:missing";

  assert.throws(() => Step2StructuredSchema.parse(payload));
});

test("normalizes legacy model schema_version values during API parsing", () => {
  const payload = structuredClone(validPayload);
  payload.schema_version = "2.0";

  const parsed = parseStep2StructuredResult(payload);

  assert.equal(parsed.schema_version, "v5.5");
  assert.equal(parsed.target_year, 2025);
});

test("exports a response schema object for LLM structured output", () => {
  assert.equal(typeof STEP2_RESPONSE_SCHEMA, "object");
  assert.equal((STEP2_RESPONSE_SCHEMA as Record<string, unknown>).type, "object");
});

test("exports a Gemini-safe response schema without unsupported JSON Schema keywords", () => {
  const serialized = JSON.stringify(GEMINI_STEP2_RESPONSE_SCHEMA);
  const schema = GEMINI_STEP2_RESPONSE_SCHEMA as {
    properties?: {
      rows?: {
        items?: {
          properties?: Record<string, { type?: string; nullable?: boolean }>;
        };
      };
    };
  };
  const rowProperties = schema.properties?.rows?.items?.properties;

  assert.equal(serialized.includes("\"$ref\""), false);
  assert.equal(serialized.includes("\"const\""), false);
  assert.equal(serialized.includes("\"additionalProperties\""), false);
  assert.equal(serialized.includes("\"type\":[\"number\",\"null\"]"), false);
  assert.equal(serialized.includes("\"type\":[\"string\",\"null\"]"), false);
  assert.equal(rowProperties?.revenue_usd_m?.type, "number");
  assert.equal(rowProperties?.revenue_usd_m?.nullable, true);
  assert.equal(rowProperties?.operating_income_usd_m?.type, "number");
  assert.equal(rowProperties?.operating_income_usd_m?.nullable, true);
});

test("preserves missing structured metrics as null instead of real zeroes", () => {
  const payload = structuredClone(validPayload) as Omit<typeof validPayload, "rows"> & {
    rows: Array<
      Omit<
        (typeof validPayload)["rows"][number],
        "revenue_usd_m" | "operating_income_usd_m"
      > & {
        revenue_usd_m: number | null;
        operating_income_usd_m: number | null;
      }
    >;
  };
  payload.rows[0].revenue_usd_m = null;
  payload.rows[0].operating_income_usd_m = 123;

  const parsed = Step2StructuredSchema.parse(payload);
  const rows = projectStep2StructuredToRows(parsed);

  assert.equal(rows[0].revenue, null);
  assert.match(rows[0].reviewNote ?? "", /Missing revenue/);
});
