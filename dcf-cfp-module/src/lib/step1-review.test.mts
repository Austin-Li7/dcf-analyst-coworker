import test from "node:test";
import assert from "node:assert/strict";

import {
  applyStep1ApprovalEdits,
  buildStep1ReviewState,
} from "./step1-review.ts";
import { projectStructuredStep1ToArchitecture } from "./step1-schema.ts";
import type { Step1StructuredResult } from "../types/cfp.ts";

const sampleStructuredResult: Step1StructuredResult = {
  schema_version: "v5.5",
  company_name: "Microsoft",
  reported_view: {
    view_type: "operating_segment",
    nodes: [
      {
        id: "reported:pbp",
        label: "Productivity and Business Processes",
        raw_name_variants: ["Productivity and Business Processes"],
        products: [],
        claim_id: "S1-001",
        evidence_level: "DISCLOSED",
        children: [
          {
            id: "reported:pbp:m365",
            label: "Office 365 Commercial",
            raw_name_variants: ["Office 365 Commercial"],
            products: ["Word", "Excel"],
            customer_type: "Enterprise",
            claim_id: "S1-002",
            evidence_level: "DISCLOSED",
            children: [],
          },
        ],
      },
      {
        id: "reported:cloud",
        label: "Intelligent Cloud",
        raw_name_variants: ["Intelligent Cloud"],
        products: [],
        claim_id: "S1-003",
        evidence_level: "DISCLOSED",
        children: [
          {
            id: "reported:cloud:power-bi",
            label: "Power BI",
            raw_name_variants: ["Power BI"],
            products: [],
            customer_type: "Enterprise",
            claim_id: "S1-004",
            evidence_level: "STRONG_INFERENCE",
            children: [],
          },
        ],
      },
    ],
  },
  analysis_view: {
    segments: [
      {
        id: "segment:pbp",
        canonical_name: "Productivity and Business Processes",
        raw_name_variants: ["Productivity and Business Processes"],
        mapped_from_reported_node_ids: ["reported:pbp"],
        claim_id: "S1-010",
        evidence_level: "DISCLOSED",
        offerings: [
          {
            id: "offering:m365",
            canonical_name: "Office 365 Commercial",
            category: "Software",
            raw_name_variants: ["Office 365 Commercial"],
            mapped_from_reported_node_ids: ["reported:pbp:m365"],
            products: ["Word", "Excel"],
            customer_type: "Enterprise",
            claim_id: "S1-011",
            evidence_level: "DISCLOSED",
          },
          {
            id: "offering:power-bi",
            canonical_name: "Power BI",
            category: "Analytics",
            raw_name_variants: ["Power BI"],
            mapped_from_reported_node_ids: ["reported:cloud:power-bi"],
            products: [],
            customer_type: "Enterprise",
            claim_id: "S1-012",
            evidence_level: "STRONG_INFERENCE",
          },
        ],
      },
      {
        id: "segment:cloud",
        canonical_name: "Intelligent Cloud",
        raw_name_variants: ["Intelligent Cloud"],
        mapped_from_reported_node_ids: ["reported:cloud"],
        claim_id: "S1-013",
        evidence_level: "DISCLOSED",
        offerings: [],
      },
    ],
    excluded_items: [
      {
        raw_name: "LinkedIn Marketing Solutions",
        reason: "Insufficient disclosure to map conservatively.",
        evidence_level: "UNSUPPORTED",
        claim_id: "S1-020",
      },
    ],
    canonical_name_registry: {},
  },
  claims: [
    {
      claim_id: "S1-001",
      text: "PBP is a reported segment.",
      source_snippet: "PBP revenue ...",
      source_location: "10-K",
      evidence_level: "DISCLOSED",
    },
    {
      claim_id: "S1-002",
      text: "Office 365 Commercial is disclosed within PBP.",
      source_snippet: "Office 365 Commercial revenue ...",
      source_location: "10-K",
      evidence_level: "DISCLOSED",
    },
    {
      claim_id: "S1-003",
      text: "Intelligent Cloud is a reported segment.",
      source_snippet: "Intelligent Cloud revenue ...",
      source_location: "10-K",
      evidence_level: "DISCLOSED",
    },
    {
      claim_id: "S1-004",
      text: "Power BI is referenced in the filing package.",
      source_snippet: "Power BI mention ...",
      source_location: "10-Q",
      evidence_level: "STRONG_INFERENCE",
    },
    {
      claim_id: "S1-010",
      text: "PBP is the canonical analysis segment.",
      source_snippet: "PBP revenue ...",
      source_location: "10-K",
      evidence_level: "DISCLOSED",
      basis_claim_ids: ["S1-001"],
    },
    {
      claim_id: "S1-011",
      text: "Office 365 Commercial maps to PBP.",
      source_snippet: "Office 365 Commercial revenue ...",
      source_location: "10-K",
      evidence_level: "DISCLOSED",
      basis_claim_ids: ["S1-002", "S1-010"],
    },
    {
      claim_id: "S1-012",
      text: "Power BI may map into the cloud analytics stack.",
      source_snippet: "Power BI mention ...",
      source_location: "10-Q",
      evidence_level: "STRONG_INFERENCE",
      basis_claim_ids: ["S1-004", "S1-013"],
    },
    {
      claim_id: "S1-013",
      text: "Intelligent Cloud is the analysis segment for cloud infrastructure.",
      source_snippet: "Intelligent Cloud revenue ...",
      source_location: "10-K",
      evidence_level: "DISCLOSED",
      basis_claim_ids: ["S1-003"],
    },
    {
      claim_id: "S1-020",
      text: "LinkedIn Marketing Solutions is excluded pending better disclosure.",
      source_snippet: null,
      source_location: null,
      evidence_level: "UNSUPPORTED",
    },
  ],
  sources: [
    {
      document: "Microsoft Form 10-K",
      section: "Segment note",
    },
  ],
};

test("buildStep1ReviewState creates dual-view review data and conservative warnings", () => {
  const review = buildStep1ReviewState(sampleStructuredResult);

  assert.equal(review.workflowStatus, "needs_review");
  assert.equal(review.reportedView.viewType, "operating_segment");
  assert.equal(review.reportedView.nodes.length, 4);
  assert.equal(review.analysisView.segments.length, 2);
  assert.equal(review.analysisView.segments[0].offerings.length, 2);
  assert.equal(
    review.canonicalNameRegistry["Office 365 Commercial"],
    "Office 365 Commercial",
  );
  assert.ok(
    review.summary.warnings.some((warning) => warning.includes("excluded")),
  );
  assert.ok(
    review.summary.warnings.some((warning) => warning.includes("no products listed")),
  );
});

test("buildStep1ReviewState creates a source validation matrix and omission review notes", () => {
  const resultWithWeakOffering: Step1StructuredResult = {
    ...sampleStructuredResult,
    analysis_view: {
      ...sampleStructuredResult.analysis_view,
      segments: sampleStructuredResult.analysis_view.segments.map((segment) =>
        segment.id === "segment:pbp"
          ? {
              ...segment,
              offerings: [
                ...segment.offerings,
                {
                  id: "offering:unsupported",
                  canonical_name: "Unsupported AI Platform",
                  category: "Platform",
                  raw_name_variants: ["Unsupported AI Platform"],
                  mapped_from_reported_node_ids: ["reported:pbp:m365"],
                  products: ["Unsupported AI"],
                  customer_type: "Enterprise",
                  claim_id: "S1-030",
                  evidence_level: "WEAK_INFERENCE",
                },
              ],
            }
          : segment,
      ),
    },
    claims: [
      ...sampleStructuredResult.claims,
      {
        claim_id: "S1-030",
        text: "Unsupported AI Platform may be attached to PBP.",
        source_snippet: null,
        source_location: null,
        evidence_level: "WEAK_INFERENCE",
      },
    ],
  };

  const review = buildStep1ReviewState(resultWithWeakOffering);

  assert.equal(review.validationMatrix.length, 5);
  assert.deepEqual(
    review.validationMatrix.find((row) => row.item === "Productivity and Business Processes"),
    {
      id: "segment:pbp",
      segment: "Productivity and Business Processes",
      item: "Productivity and Business Processes",
      validationType: "Data",
      sourceTier: "Tier 1",
      sourceFound: true,
      sourceReference: "10-K",
      officialSource: true,
      validationStatus: "Verified Official",
      recommendedAction: "Keep",
      claimId: "S1-010",
      evidenceLevel: "DISCLOSED",
    },
  );
  assert.equal(
    review.validationMatrix.find((row) => row.item === "Power BI")?.validationStatus,
    "Partially Supported",
  );
  assert.equal(
    review.validationMatrix.find((row) => row.item === "Unsupported AI Platform")
      ?.recommendedAction,
    "Remove",
  );
  assert.deepEqual(review.omissionReview, [
    {
      item: "LinkedIn Marketing Solutions",
      reason: "Insufficient disclosure to map conservatively.",
      officialSourceReference: "Not available",
      recommendedAction: "Review before adding downstream",
      claimId: "S1-020",
      evidenceLevel: "UNSUPPORTED",
    },
  ]);
});

test("applyStep1ApprovalEdits renames and remaps analysis offerings", () => {
  const updated = applyStep1ApprovalEdits(sampleStructuredResult, {
    segments: [
      {
        id: "segment:pbp",
        canonicalName: "Productivity & Business Processes",
      },
      {
        id: "segment:cloud",
        canonicalName: "Intelligent Cloud",
      },
    ],
    offerings: [
      {
        id: "offering:m365",
        canonicalName: "Microsoft 365 Commercial",
        targetSegment: "Productivity & Business Processes",
      },
      {
        id: "offering:power-bi",
        canonicalName: "Microsoft Fabric + Power BI",
        targetSegment: "Intelligent Cloud",
      },
    ],
  });

  const projected = projectStructuredStep1ToArchitecture(updated);

  assert.deepEqual(
    updated.analysis_view.segments.map((segment) => segment.canonical_name),
    ["Productivity & Business Processes", "Intelligent Cloud"],
  );
  assert.deepEqual(
    updated.analysis_view.segments.find(
      (segment) => segment.canonical_name === "Productivity & Business Processes",
    )?.offerings.map((offering) => offering.canonical_name),
    ["Microsoft 365 Commercial"],
  );
  assert.deepEqual(
    updated.analysis_view.segments.find(
      (segment) => segment.canonical_name === "Intelligent Cloud",
    )?.offerings.map((offering) => offering.canonical_name),
    ["Microsoft Fabric + Power BI"],
  );
  assert.deepEqual(
    projected.architecture.map((segment) => segment.segment),
    ["Productivity & Business Processes", "Intelligent Cloud"],
  );
});
