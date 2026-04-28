import test from "node:test";
import assert from "node:assert/strict";

import {
  GEMINI_STEP1_RESPONSE_SCHEMA,
  Step1StructuredSchema,
  projectStructuredStep1ToArchitecture,
} from "./step1-schema.ts";
import { buildStep1ReviewState } from "./step1-review.ts";

test("parses a valid step 1 structured payload with reported and analysis views", () => {
  const payload = {
    schema_version: "v5.5",
    company_name: "Apple Inc.",
    ticker: "AAPL",
    reported_view: {
      view_type: "revenue_category",
      nodes: [
        {
          id: "reported:products",
          label: "Products",
          raw_name_variants: ["Products"],
          children: [
            {
              id: "reported:products:iphone",
              label: "iPhone",
              raw_name_variants: ["iPhone"],
              products: ["iPhone 16", "iPhone 16 Pro"],
              customer_type: "Consumer",
              claim_id: "S1-001",
              evidence_level: "DISCLOSED",
            },
          ],
          claim_id: "S1-000",
          evidence_level: "DISCLOSED",
        },
      ],
    },
    analysis_view: {
      segments: [
        {
          id: "segment:products",
          canonical_name: "Products",
          raw_name_variants: ["Products"],
          mapped_from_reported_node_ids: ["reported:products"],
          claim_id: "S1-010",
          evidence_level: "DISCLOSED",
          offerings: [
            {
              id: "offering:iphone",
              canonical_name: "iPhone",
              category: "Hardware",
              raw_name_variants: ["iPhone"],
              mapped_from_reported_node_ids: ["reported:products:iphone"],
              products: ["iPhone 16", "iPhone 16 Pro"],
              customer_type: "Consumer",
              claim_id: "S1-011",
              evidence_level: "DISCLOSED",
            },
          ],
        },
      ],
      excluded_items: [],
      canonical_name_registry: {
        Products: "Products",
        iPhone: "iPhone",
      },
    },
    claims: [
      {
        claim_id: "S1-000",
        text: "Apple reports Products as a revenue category.",
        source_snippet: "Products net sales ...",
        source_location: "Form 10-K, Net Sales by Category",
        evidence_level: "DISCLOSED",
      },
      {
        claim_id: "S1-001",
        text: "Apple reports iPhone within Products.",
        source_snippet: "iPhone net sales ...",
        source_location: "Form 10-K, Net Sales by Category",
        evidence_level: "DISCLOSED",
      },
      {
        claim_id: "S1-010",
        text: "Products is used as the canonical analysis segment for hardware offerings.",
        source_snippet: "Products net sales ...",
        source_location: "Form 10-K, Net Sales by Category",
        evidence_level: "DISCLOSED",
        basis_claim_ids: ["S1-000"],
      },
      {
        claim_id: "S1-011",
        text: "iPhone maps to the Products segment as a hardware offering.",
        source_snippet: "iPhone net sales ...",
        source_location: "Form 10-K, Net Sales by Category",
        evidence_level: "DISCLOSED",
        basis_claim_ids: ["S1-001", "S1-010"],
      },
    ],
    sources: [
      {
        document: "Apple Inc. Form 10-K",
        section: "Net sales by category",
      },
    ],
  };

  const parsed = Step1StructuredSchema.parse(payload);
  const legacy = projectStructuredStep1ToArchitecture(parsed);
  const review = buildStep1ReviewState(parsed);

  assert.equal(parsed.reported_view.view_type, "revenue_category");
  assert.equal(parsed.ticker, "AAPL");
  assert.equal(legacy.architecture[0].segment, "Products");
  assert.deepEqual(legacy.architecture[0].businessLines.map((line) => line.name), ["iPhone"]);
  assert.equal(review.workflowStatus, "needs_review");
  assert.equal(review.reportedView.nodes.length, 2);
  assert.equal(review.analysisView.segments[0].offeringCount, 1);
});

test("rejects a segment that is missing mapping provenance", () => {
  const payload = {
    schema_version: "v5.5",
    company_name: "Example Corp",
    reported_view: { view_type: "operating_segment", nodes: [] },
    analysis_view: {
      segments: [
        {
          id: "segment:bad",
          canonical_name: "Bad Segment",
          raw_name_variants: ["Bad Segment"],
          mapped_from_reported_node_ids: [],
          claim_id: "S1-001",
          evidence_level: "DISCLOSED",
          offerings: [],
        },
      ],
      excluded_items: [],
      canonical_name_registry: { "Bad Segment": "Bad Segment" },
    },
    claims: [],
    sources: [],
  };

  assert.throws(() => Step1StructuredSchema.parse(payload));
});

test("rejects an offering claim that cannot be traced back to a declared claim", () => {
  const payload = {
    schema_version: "v5.5",
    company_name: "Example Corp",
    reported_view: {
      view_type: "mixed",
      nodes: [
        {
          id: "reported:core",
          label: "Core",
          raw_name_variants: ["Core"],
          claim_id: "S1-001",
          evidence_level: "DISCLOSED",
          children: [],
        },
      ],
    },
    analysis_view: {
      segments: [
        {
          id: "segment:core",
          canonical_name: "Core",
          raw_name_variants: ["Core"],
          mapped_from_reported_node_ids: ["reported:core"],
          claim_id: "S1-002",
          evidence_level: "DISCLOSED",
          offerings: [
            {
              id: "offering:phantom",
              canonical_name: "Phantom",
              category: "Software",
              raw_name_variants: ["Phantom"],
              mapped_from_reported_node_ids: ["reported:core"],
              products: [],
              customer_type: "Mixed",
              claim_id: "S1-999",
              evidence_level: "DISCLOSED",
            },
          ],
        },
      ],
      excluded_items: [],
      canonical_name_registry: { Core: "Core", Phantom: "Phantom" },
    },
    claims: [
      {
        claim_id: "S1-001",
        text: "Core is a reported node.",
        source_snippet: "Core revenue ...",
        source_location: "10-K",
        evidence_level: "DISCLOSED",
      },
      {
        claim_id: "S1-002",
        text: "Core is the analysis segment.",
        source_snippet: "Core revenue ...",
        source_location: "10-K",
        evidence_level: "DISCLOSED",
      },
    ],
    sources: [{ document: "Example 10-K", section: "Segment note" }],
  };

  assert.throws(() => Step1StructuredSchema.parse(payload));
});

test("exports a Gemini-safe response schema without unsupported JSON Schema keywords", () => {
  const serialized = JSON.stringify(GEMINI_STEP1_RESPONSE_SCHEMA);

  assert.equal(serialized.includes("\"$ref\""), false);
  assert.equal(serialized.includes("\"const\""), false);
  assert.equal(serialized.includes("\"additionalProperties\""), false);
  assert.equal(serialized.includes("\"propertyNames\""), false);
});

test("exports a Gemini-safe reported_view tree with structured child nodes", () => {
  const schema = GEMINI_STEP1_RESPONSE_SCHEMA as {
    properties?: {
      reported_view?: {
        properties?: {
          nodes?: {
            items?: {
              properties?: {
                children?: {
                  items?: {
                    type?: string;
                    required?: string[];
                    properties?: {
                      children?: {
                        items?: {
                          type?: string;
                        };
                      };
                    };
                  };
                };
              };
            };
          };
        };
      };
    };
  };
  const firstLevelChildItems =
    schema.properties?.reported_view?.properties?.nodes?.items?.properties
      ?.children?.items;
  const secondLevelChildItems =
    firstLevelChildItems?.properties?.children?.items;

  assert.equal(firstLevelChildItems?.type, "object");
  assert.equal(secondLevelChildItems?.type, "object");
  assert.equal(
    Array.isArray(firstLevelChildItems?.required) &&
      firstLevelChildItems.required.includes("label"),
    true,
  );
});

test("compacts verbose product lists, variants, and source snippets at the schema boundary", () => {
  const payload = {
    schema_version: "v5.5",
    company_name: "Verbose Corp",
    reported_view: {
      view_type: "revenue_category",
      nodes: [
        {
          id: "reported:products",
          label: "Products",
          raw_name_variants: ["Products", "Product Revenue", "Hardware Revenue"],
          products: ["A", "B", "C", "D", "E"],
          claim_id: "S1-001",
          evidence_level: "DISCLOSED",
          children: [],
        },
      ],
    },
    analysis_view: {
      segments: [
        {
          id: "segment:products",
          canonical_name: "Products",
          raw_name_variants: ["Products", "Product Revenue", "Hardware Revenue"],
          mapped_from_reported_node_ids: ["reported:products"],
          claim_id: "S1-002",
          evidence_level: "DISCLOSED",
          offerings: [
            {
              id: "offering:hardware",
              canonical_name: "Hardware",
              category: "Hardware",
              raw_name_variants: ["Hardware", "Devices", "Equipment"],
              mapped_from_reported_node_ids: ["reported:products"],
              products: ["A", "B", "C", "D", "E"],
              customer_type: "Mixed",
              claim_id: "S1-003",
              evidence_level: "DISCLOSED",
            },
          ],
        },
      ],
      excluded_items: [],
      canonical_name_registry: { Products: "Products", Hardware: "Hardware" },
    },
    claims: [
      {
        claim_id: "S1-001",
        text: "Products are reported.",
        source_snippet: "x".repeat(400),
        source_location: "Annual report segment note",
        evidence_level: "DISCLOSED",
      },
      {
        claim_id: "S1-002",
        text: "Products maps to Products.",
        source_snippet: "Products net sales.",
        source_location: "Annual report segment note",
        evidence_level: "DISCLOSED",
        basis_claim_ids: ["S1-001"],
      },
      {
        claim_id: "S1-003",
        text: "Hardware maps to Products.",
        source_snippet: "Hardware product examples.",
        source_location: "Annual report product discussion",
        evidence_level: "DISCLOSED",
        basis_claim_ids: ["S1-001", "S1-002"],
      },
    ],
    sources: [{ document: "Verbose 10-K", section: "Business" }],
  };

  const parsed = Step1StructuredSchema.parse(payload);

  assert.deepEqual(parsed.reported_view.nodes[0].products, ["A", "B", "C"]);
  assert.deepEqual(parsed.reported_view.nodes[0].raw_name_variants, [
    "Products",
    "Product Revenue",
  ]);
  assert.deepEqual(parsed.analysis_view.segments[0].offerings[0].products, ["A", "B", "C"]);
  assert.equal(parsed.claims[0].source_snippet?.length, 180);
});
