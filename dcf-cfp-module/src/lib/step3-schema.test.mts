import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  GEMINI_STEP3_RESPONSE_SCHEMA,
  STEP3_RESPONSE_SCHEMA,
  Step3StructuredSchema,
  buildStep3ReviewState,
  parseStep3StructuredResult,
  projectStep3StructuredToCategories,
} from "./step3-schema.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../test/fixtures/step3/apple/apple-step3-competition-v55.json", import.meta.url),
    "utf8",
  ),
);

test("parses Step 3 v5.5 competition output and projects legacy categories", () => {
  const parsed = Step3StructuredSchema.parse(fixture);
  const categories = projectStep3StructuredToCategories(parsed);

  assert.equal(parsed.schema_version, "v5.5");
  assert.equal(parsed.categories.length, 2);
  assert.equal(categories[0].category, "iPhone");
  assert.equal(categories[0].primaryCompetitor, "Samsung Electronics");
  assert.equal(categories[0].basisForPairing.includes("premium smartphone"), true);
  assert.equal(categories[0].forces.rivalry.rating, "High");
  assert.equal(categories[1].confidence, "Medium");
});

test("builds review state with summary and editable category fields", () => {
  const parsed = parseStep3StructuredResult(fixture);
  const review = buildStep3ReviewState(parsed);

  assert.equal(review.workflowStatus, "needs_review");
  assert.equal(review.summary.warnings.length, 1);
  assert.equal(review.categories.length, 2);
  assert.equal(review.categories[1].humanReviewRequired, true);
  assert.equal(review.categories[1].editable.primaryCompetitor, "Alphabet");
  assert.equal(review.categories[1].sources.length, 2);
  assert.equal(review.validationWarnings[0].categoryIds[0], "category:services");
});

test("rejects categories whose source_ids are not declared", () => {
  const payload = structuredClone(fixture);
  payload.categories[0].source_ids = ["source:missing"];

  assert.throws(() => Step3StructuredSchema.parse(payload));
});

test("rejects force rows whose claim_id is not declared", () => {
  const payload = structuredClone(fixture);
  payload.categories[0].forces.rivalry.claim_id = "S3-MISSING";

  assert.throws(() => Step3StructuredSchema.parse(payload));
});

test("normalizes legacy model schema_version values during API parsing", () => {
  const payload = structuredClone(fixture);
  payload.schema_version = "3.0";

  const parsed = parseStep3StructuredResult(payload);

  assert.equal(parsed.schema_version, "v5.5");
  assert.equal(parsed.company_name, "Apple Inc.");
});

test("normalizes model output with camelCase force keys and verbose excerpts", () => {
  const payload = structuredClone(fixture);
  payload.sources[0].excerpt = "A".repeat(320);
  payload.sources[1].excerpt = "B".repeat(320);
  for (const category of payload.categories) {
    category.forces = {
      rivalry: category.forces.rivalry,
      newEntrants: category.forces.new_entrants,
      suppliers: category.forces.suppliers,
      buyers: category.forces.buyers,
      substitutes: category.forces.substitutes,
    };
  }

  const parsed = parseStep3StructuredResult(payload);

  assert.equal(parsed.sources[0].excerpt?.length, 260);
  assert.equal(parsed.sources[1].excerpt?.length, 260);
  assert.equal(parsed.categories[0].forces.new_entrants.rating, "Low");
});

test("normalizes common Porter force label keys from model output", () => {
  const payload = structuredClone(fixture);
  for (const category of payload.categories) {
    category.forces = {
      intensity_of_rivalry: category.forces.rivalry,
      threat_of_new_entrants: category.forces.new_entrants,
      bargaining_power_of_suppliers: category.forces.suppliers,
      bargaining_power_of_buyers: category.forces.buyers,
      threat_of_substitutes: category.forces.substitutes,
    };
  }

  const parsed = parseStep3StructuredResult(payload);

  assert.equal(parsed.categories[0].forces.rivalry.rating, "High");
  assert.equal(parsed.categories[0].forces.suppliers.rating, "Medium");
  assert.equal(parsed.categories[1].forces.buyers.rating, "Medium");
  assert.equal(parsed.categories[1].forces.substitutes.rating, "High");
});

test("normalizes human-readable Porter force label keys from model output", () => {
  const payload = structuredClone(fixture);
  for (const category of payload.categories) {
    category.forces = {
      "Competitive Rivalry": category.forces.rivalry,
      "Threat of New Entrants": category.forces.new_entrants,
      "Bargaining Power of Suppliers": category.forces.suppliers,
      "Bargaining Power of Buyers": category.forces.buyers,
      "Threat of Substitute Products or Services": category.forces.substitutes,
    };
  }

  const parsed = parseStep3StructuredResult(payload);

  assert.equal(parsed.categories[0].forces.new_entrants.rating, "Low");
  assert.equal(parsed.categories[0].forces.suppliers.rating, "Medium");
  assert.equal(parsed.categories[1].forces.buyers.rating, "Medium");
  assert.equal(parsed.categories[1].forces.substitutes.rating, "High");
});

test("normalizes common force detail field aliases from model output", () => {
  const payload = structuredClone(fixture);
  for (const category of payload.categories) {
    category.forces = {
      rivalry: category.forces.rivalry,
      newEntrants: {
        assessment: category.forces.new_entrants.rating,
        rationale: category.forces.new_entrants.justification,
        claimId: category.forces.new_entrants.claim_id,
        sourceIds: category.forces.new_entrants.source_ids,
      },
      suppliers: {
        level: category.forces.suppliers.rating,
        explanation: category.forces.suppliers.justification,
        claimId: category.forces.suppliers.claim_id,
        sourceIds: category.forces.suppliers.source_ids,
      },
      buyers: {
        score: category.forces.buyers.rating,
        reason: category.forces.buyers.justification,
        claim_id: category.forces.buyers.claim_id,
        source_ids: category.forces.buyers.source_ids,
      },
      substitutes: {
        risk: category.forces.substitutes.rating,
        analysis: category.forces.substitutes.justification,
        claimId: category.forces.substitutes.claim_id,
        sourceIds: category.forces.substitutes.source_ids,
      },
    };
  }

  const parsed = parseStep3StructuredResult(payload);

  assert.equal(parsed.categories[0].forces.new_entrants.rating, "Low");
  assert.equal(parsed.categories[0].forces.suppliers.justification.length > 0, true);
  assert.equal(parsed.categories[1].forces.buyers.source_ids.length > 0, true);
  assert.equal(parsed.categories[1].forces.substitutes.claim_id.length > 0, true);
});

test("fills omitted Porter forces with review-gated defaults instead of blocking Step 3", () => {
  const payload = structuredClone(fixture);
  for (const category of payload.categories) {
    category.forces = {
      rivalry: category.forces.rivalry,
    };
  }

  const parsed = parseStep3StructuredResult(payload);

  assert.equal(parsed.categories[0].forces.new_entrants.rating, "Medium");
  assert.match(parsed.categories[0].forces.new_entrants.justification, /omitted/i);
  assert.equal(parsed.categories[0].forces.suppliers.claim_id, parsed.categories[0].basis_claim_ids[0]);
  assert.deepEqual(parsed.categories[0].forces.buyers.source_ids, parsed.categories[0].source_ids);
  assert.equal(parsed.categories[1].human_review_required, true);
  assert.equal(
    parsed.validation_warnings.some((warning) => warning.code === "PORTER_FORCE_DEFAULTED"),
    true,
  );
});

test("fills empty force source_ids and truncates long claim snippets instead of blocking Step 3", () => {
  const payload = structuredClone(fixture);
  payload.claims[1].source_snippet = "C".repeat(320);
  payload.categories[0].forces.substitutes.source_ids = [];
  payload.categories[1].forces.buyers.source_ids = [];
  payload.categories[1].forces.substitutes.source_ids = [];

  const parsed = parseStep3StructuredResult(payload);

  assert.equal(parsed.claims[1].source_snippet?.length, 220);
  assert.deepEqual(
    parsed.categories[0].forces.substitutes.source_ids,
    parsed.categories[0].source_ids,
  );
  assert.deepEqual(
    parsed.categories[1].forces.buyers.source_ids,
    parsed.categories[1].source_ids,
  );
  assert.equal(parsed.categories[0].human_review_required, true);
  assert.equal(
    parsed.validation_warnings.some((warning) => warning.code === "PORTER_FORCE_SOURCE_DEFAULTED"),
    true,
  );
});

test("exports response schemas for LLM structured output", () => {
  assert.equal(typeof STEP3_RESPONSE_SCHEMA, "object");
  assert.equal((STEP3_RESPONSE_SCHEMA as Record<string, unknown>).type, "object");
});

test("exports a Gemini-safe response schema without unsupported JSON Schema keywords", () => {
  const serialized = JSON.stringify(GEMINI_STEP3_RESPONSE_SCHEMA);
  const schema = GEMINI_STEP3_RESPONSE_SCHEMA as {
    properties?: {
      categories?: {
        items?: {
          properties?: Record<string, { type?: string; nullable?: boolean }>;
        };
      };
    };
  };
  const categoryProperties = schema.properties?.categories?.items?.properties;

  assert.equal(serialized.includes("\"$ref\""), false);
  assert.equal(serialized.includes("\"const\""), false);
  assert.equal(serialized.includes("\"additionalProperties\""), false);
  assert.equal(serialized.includes("\"propertyNames\""), false);
  assert.equal(serialized.includes("\"type\":[\"string\",\"null\"]"), false);
  assert.equal(categoryProperties?.verification_note?.type, "string");
  assert.equal(categoryProperties?.verification_note?.nullable, true);
});
