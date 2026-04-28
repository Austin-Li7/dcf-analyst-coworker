import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  GEMINI_STEP4_RESPONSE_SCHEMA,
  STEP4_RESPONSE_SCHEMA,
  Step4StructuredSchema,
  buildStep4ReviewState,
  parseStep4StructuredResult,
  projectStep4StructuredToCapital,
  projectStep4StructuredToPaths,
} from "./step4-schema.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../test/fixtures/step4/apple/apple-step4-synergies-capital-v55.json", import.meta.url),
    "utf8",
  ),
);

test("parses Step 4 v5.5 synergy and capital output and projects legacy UI data", () => {
  const parsed = Step4StructuredSchema.parse(fixture);
  const paths = projectStep4StructuredToPaths(parsed);
  const capital = projectStep4StructuredToCapital(parsed);

  assert.equal(parsed.schema_version, "v5.5");
  assert.equal(parsed.synergy_registry.length, 1);
  assert.equal(paths[0].sourceBusiness, "iPhone");
  assert.equal(paths[0].synergyClassification, "Material Synergy");
  assert.equal(paths[0].financialSignal.type, "Revenue Enablement");
  assert.equal(capital.investmentMatrix[0].pillar, "Core infrastructure");
  assert.equal(capital.checkpoints.capexRunway.includes("Normal"), true);
});

test("builds Step 4 review state with summary, source grounding, and editable entries", () => {
  const parsed = parseStep4StructuredResult(fixture);
  const review = buildStep4ReviewState(parsed);

  assert.equal(review.workflowStatus, "needs_review");
  assert.equal(review.summary.warnings.length, 1);
  assert.equal(review.synergies[0].humanReviewRequired, true);
  assert.equal(review.synergies[0].sources.length, 1);
  assert.equal(review.synergies[0].editable.mechanism.includes("Device ownership"), true);
  assert.equal(review.capitalMetrics[0].sources[0].source_id, "source:apple:10k:cashflow");
  assert.equal(review.capitalAllocation.assetLightExemption, true);
  assert.equal(review.validationWarnings[0].synergyIds[0], "synergy:iphone-services");
});

test("rejects synergies whose source_ids are not declared", () => {
  const payload = structuredClone(fixture);
  payload.synergy_registry[0].financial_signal.source_ids = ["source:missing"];

  assert.throws(() => Step4StructuredSchema.parse(payload));
});

test("rejects capital metrics whose claim_id is not declared", () => {
  const payload = structuredClone(fixture);
  payload.capital_allocation.capital_metrics[0].claim_id = "S4-MISSING";

  assert.throws(() => Step4StructuredSchema.parse(payload));
});

test("normalizes legacy model schema_version values and camelCase keys during API parsing", () => {
  const payload = structuredClone(fixture);
  payload.schema_version = "4.0";
  payload.synergy_registry[0].financialSignal = payload.synergy_registry[0].financial_signal;
  payload.synergy_registry[0].flywheel = {
    isFlywheel: payload.synergy_registry[0].flywheel.is_flywheel,
    loopDescription: payload.synergy_registry[0].flywheel.loop_description,
  };
  delete payload.synergy_registry[0].financial_signal;

  const parsed = parseStep4StructuredResult(payload);

  assert.equal(parsed.schema_version, "v5.5");
  assert.equal(parsed.synergy_registry[0].financial_signal.claim_id, "S4-C1");
  assert.equal(parsed.synergy_registry[0].flywheel.is_flywheel, true);
});

test("compacts verbose claim source snippets at the Step 4 schema boundary", () => {
  const payload = structuredClone(fixture);
  payload.claims[0].source_snippet = "A".repeat(360);

  const parsed = parseStep4StructuredResult(payload);

  assert.equal(parsed.claims[0].source_snippet?.length, 220);
});

test("normalizes multi-id capital synergy links instead of blocking Step 4", () => {
  const payload = structuredClone(fixture);
  payload.synergy_registry = [
    { ...payload.synergy_registry[0], synergy_id: "S-01" },
    { ...payload.synergy_registry[0], synergy_id: "S-02" },
    { ...payload.synergy_registry[0], synergy_id: "S-03" },
  ];
  payload.capital_allocation.capital_metrics = [
    {
      ...payload.capital_allocation.capital_metrics[0],
      metric_id: "CM-01",
      synergy_link: "S-01, S-02",
    },
    {
      ...payload.capital_allocation.capital_metrics[0],
      metric_id: "CM-02",
      synergy_link: "S-01, S-03",
    },
  ];

  const parsed = parseStep4StructuredResult(payload);

  assert.equal(parsed.capital_allocation.capital_metrics[0].synergy_link, "S-01");
  assert.equal(parsed.capital_allocation.capital_metrics[1].synergy_link, "S-01");
  assert.equal(
    parsed.validation_warnings.some((warning) => warning.code === "CAPITAL_SYNERGY_LINK_NORMALIZED"),
    true,
  );
  assert.equal(parsed.capital_allocation.workflow_status, "NEEDS_REVIEW");
});

test("exports response schemas for structured LLM output", () => {
  assert.equal(typeof STEP4_RESPONSE_SCHEMA, "object");
  assert.equal((STEP4_RESPONSE_SCHEMA as Record<string, unknown>).type, "object");
});

test("exports a Gemini-safe Step 4 response schema without unsupported keywords", () => {
  const serialized = JSON.stringify(GEMINI_STEP4_RESPONSE_SCHEMA);

  assert.equal(serialized.includes("\"$ref\""), false);
  assert.equal(serialized.includes("\"const\""), false);
  assert.equal(serialized.includes("\"additionalProperties\""), false);
  assert.equal(serialized.includes("\"type\":[\"number\",\"null\"]"), false);
  assert.equal(serialized.includes("\"type\":[\"string\",\"null\"]"), false);
});
