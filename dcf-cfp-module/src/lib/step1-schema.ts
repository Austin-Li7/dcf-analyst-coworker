import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  BusinessArchitecture,
  Step1StructuredResult,
} from "../types/cfp.ts";

const EvidenceLevelSchema = z.enum([
  "DISCLOSED",
  "STRONG_INFERENCE",
  "WEAK_INFERENCE",
  "UNSUPPORTED",
]);

function compactStringList(maxItems: number) {
  return z.array(z.string().min(1)).transform((items) => items.slice(0, maxItems));
}

function compactText(maxLength: number) {
  return z.string().min(1).transform((value) => value.slice(0, maxLength));
}

const SourceSchema = z.object({
  document: z.string().min(1),
  section: z.string().min(1),
  page: z.string().min(1).optional(),
});

const ClaimSchema = z.object({
  claim_id: z.string().min(1),
  text: z.string().min(1),
  source_snippet: compactText(180).nullable(),
  source_location: z.string().min(1).nullable(),
  evidence_level: EvidenceLevelSchema,
  basis_claim_ids: z.array(z.string().min(1)).optional(),
});

const ReportedNodeSchema: z.ZodTypeAny = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    raw_name_variants: compactStringList(2).default([]),
    products: compactStringList(3).default([]),
    customer_type: z.string().min(1).optional(),
    claim_id: z.string().min(1),
    evidence_level: EvidenceLevelSchema,
    children: z.array(ReportedNodeSchema).default([]),
  }),
);

const AnalysisOfferingSchema = z.object({
  id: z.string().min(1),
  canonical_name: z.string().min(1),
  category: z.string().min(1),
  raw_name_variants: compactStringList(2).default([]),
  mapped_from_reported_node_ids: z.array(z.string().min(1)).min(1),
  products: compactStringList(3).default([]),
  customer_type: z.string().min(1),
  claim_id: z.string().min(1),
  evidence_level: EvidenceLevelSchema,
});

const AnalysisSegmentSchema = z.object({
  id: z.string().min(1),
  canonical_name: z.string().min(1),
  raw_name_variants: compactStringList(2).default([]),
  mapped_from_reported_node_ids: z.array(z.string().min(1)).min(1),
  claim_id: z.string().min(1),
  evidence_level: EvidenceLevelSchema,
  offerings: z.array(AnalysisOfferingSchema).default([]),
});

const ExcludedItemSchema = z.object({
  raw_name: z.string().min(1),
  reason: z.string().min(1),
  evidence_level: EvidenceLevelSchema,
  claim_id: z.string().min(1),
});

function collectReportedNodeIds(
  nodes: Step1StructuredResult["reported_view"]["nodes"],
  idSet = new Set<string>(),
): Set<string> {
  for (const node of nodes) {
    idSet.add(node.id);
    collectReportedNodeIds(node.children, idSet);
  }
  return idSet;
}

export const Step1StructuredSchema = z
  .object({
    schema_version: z.literal("v5.5"),
    company_name: z.string().min(1),
    ticker: z.string().min(1).nullable().optional(),
    reported_view: z.object({
      view_type: z.enum(["operating_segment", "revenue_category", "geography", "mixed"]),
      nodes: z.array(ReportedNodeSchema),
    }),
    analysis_view: z.object({
      segments: z.array(AnalysisSegmentSchema),
      excluded_items: z.array(ExcludedItemSchema),
      canonical_name_registry: z.record(z.string().min(1), z.string().min(1)),
    }),
    claims: z.array(ClaimSchema),
    sources: z.array(SourceSchema),
  })
  .superRefine((payload, ctx) => {
    const claimIds = new Set(payload.claims.map((claim) => claim.claim_id));
    const reportedNodeIds = collectReportedNodeIds(payload.reported_view.nodes);

    const ensureClaimExists = (claimId: string, path: (string | number)[]) => {
      if (!claimIds.has(claimId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path,
          message: `Unknown claim_id "${claimId}"`,
        });
      }
    };

    const ensureNodeIdsExist = (ids: string[], path: (string | number)[]) => {
      for (const id of ids) {
        if (!reportedNodeIds.has(id)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path,
            message: `Unknown reported node id "${id}"`,
          });
        }
      }
    };

    const visitReportedNodes = (
      nodes: Step1StructuredResult["reported_view"]["nodes"],
      parentPath: (string | number)[],
    ) => {
      nodes.forEach((node, index) => {
        ensureClaimExists(node.claim_id, [...parentPath, index, "claim_id"]);
        visitReportedNodes(node.children, [...parentPath, index, "children"]);
      });
    };

    visitReportedNodes(payload.reported_view.nodes, ["reported_view", "nodes"]);

    payload.analysis_view.segments.forEach((segment, segmentIndex) => {
      ensureClaimExists(segment.claim_id, [
        "analysis_view",
        "segments",
        segmentIndex,
        "claim_id",
      ]);
      ensureNodeIdsExist(segment.mapped_from_reported_node_ids, [
        "analysis_view",
        "segments",
        segmentIndex,
        "mapped_from_reported_node_ids",
      ]);

      segment.offerings.forEach((offering, offeringIndex) => {
        ensureClaimExists(offering.claim_id, [
          "analysis_view",
          "segments",
          segmentIndex,
          "offerings",
          offeringIndex,
          "claim_id",
        ]);
        ensureNodeIdsExist(offering.mapped_from_reported_node_ids, [
          "analysis_view",
          "segments",
          segmentIndex,
          "offerings",
          offeringIndex,
          "mapped_from_reported_node_ids",
        ]);
      });
    });

    payload.analysis_view.excluded_items.forEach((item, index) => {
      ensureClaimExists(item.claim_id, ["analysis_view", "excluded_items", index, "claim_id"]);
    });

    payload.claims.forEach((claim, claimIndex) => {
      claim.basis_claim_ids?.forEach((basisClaimId, basisIndex) => {
        ensureClaimExists(basisClaimId, [
          "claims",
          claimIndex,
          "basis_claim_ids",
          basisIndex,
        ]);
      });
    });
  });

const generatedSchema = zodToJsonSchema(Step1StructuredSchema, "Step1StructuredResult");

function createGeminiReportedNodeSchema(depthRemaining: number): Record<string, unknown> {
  return {
    type: "object",
    properties: {
      id: { type: "string", minLength: 1 },
      label: { type: "string", minLength: 1 },
      raw_name_variants: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
      products: {
        type: "array",
        items: { type: "string", minLength: 1 },
      },
      customer_type: { type: "string", minLength: 1 },
      claim_id: { type: "string", minLength: 1 },
      evidence_level: {
        type: "string",
        enum: ["DISCLOSED", "STRONG_INFERENCE", "WEAK_INFERENCE", "UNSUPPORTED"],
      },
      children: {
        type: "array",
        items:
          depthRemaining > 0
            ? createGeminiReportedNodeSchema(depthRemaining - 1)
            : {
                type: "object",
                properties: {
                  id: { type: "string", minLength: 1 },
                  label: { type: "string", minLength: 1 },
                  raw_name_variants: {
                    type: "array",
                    items: { type: "string", minLength: 1 },
                  },
                  products: {
                    type: "array",
                    items: { type: "string", minLength: 1 },
                  },
                  customer_type: { type: "string", minLength: 1 },
                  claim_id: { type: "string", minLength: 1 },
                  evidence_level: {
                    type: "string",
                    enum: [
                      "DISCLOSED",
                      "STRONG_INFERENCE",
                      "WEAK_INFERENCE",
                      "UNSUPPORTED",
                    ],
                  },
                  children: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        id: { type: "string", minLength: 1 },
                        label: { type: "string", minLength: 1 },
                        claim_id: { type: "string", minLength: 1 },
                        evidence_level: {
                          type: "string",
                          enum: [
                            "DISCLOSED",
                            "STRONG_INFERENCE",
                            "WEAK_INFERENCE",
                            "UNSUPPORTED",
                          ],
                        },
                      },
                      required: ["id", "label", "claim_id", "evidence_level"],
                    },
                  },
                },
                required: ["id", "label", "claim_id", "evidence_level"],
              },
      },
    },
    required: ["id", "label", "claim_id", "evidence_level"],
  };
}

function buildGeminiStep1ResponseSchema(): Record<string, unknown> {
  const baseSchema = sanitizeSchemaForGemini(STEP1_RESPONSE_SCHEMA) as Record<string, unknown>;
  const properties = (baseSchema.properties ?? {}) as Record<string, unknown>;
  const reportedView = (properties.reported_view ?? {}) as Record<string, unknown>;
  const reportedViewProperties = (reportedView.properties ?? {}) as Record<string, unknown>;

  return {
    ...baseSchema,
    properties: {
      ...properties,
      reported_view: {
        ...reportedView,
        properties: {
          ...reportedViewProperties,
          nodes: {
            type: "array",
            items: createGeminiReportedNodeSchema(4),
          },
        },
      },
    },
  };
}

function sanitizeSchemaForGemini(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeSchemaForGemini(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;

  if (typeof record.$ref === "string") {
    const refTarget = record.$ref.split("/").pop();
    if (refTarget && generatedSchema.definitions && refTarget in generatedSchema.definitions) {
      return sanitizeSchemaForGemini(
        generatedSchema.definitions[refTarget as keyof typeof generatedSchema.definitions],
      );
    }
  }

  const nextEntries = Object.entries(record)
    .filter(([key]) =>
      !["$schema", "$ref", "definitions", "const", "additionalProperties", "propertyNames"].includes(
        key,
      ),
    )
    .map(([key, entryValue]) => {
      if (key === "type" && entryValue === "null") {
        return [key, "string"] as const;
      }

      if (key === "anyOf" && Array.isArray(entryValue)) {
        const nonNullOptions = entryValue
          .filter((option) => !(option && typeof option === "object" && (option as Record<string, unknown>).type === "null"))
          .map((option) => sanitizeSchemaForGemini(option));

        if (nonNullOptions.length === 1) {
          return ["type", (nonNullOptions[0] as Record<string, unknown>).type ?? "string"] as const;
        }

        return [key, nonNullOptions] as const;
      }

      return [key, sanitizeSchemaForGemini(entryValue)] as const;
    });

  const sanitized = Object.fromEntries(nextEntries) as Record<string, unknown>;

  if (Array.isArray(sanitized.required)) {
    sanitized.required = sanitized.required.filter((entry) => typeof entry === "string");
  }

  return sanitized;
}

export const STEP1_RESPONSE_SCHEMA =
  "definitions" in generatedSchema && generatedSchema.definitions
    ? generatedSchema.definitions.Step1StructuredResult
    : generatedSchema;

export const GEMINI_STEP1_RESPONSE_SCHEMA = sanitizeSchemaForGemini(
  buildGeminiStep1ResponseSchema(),
) as Record<string, unknown>;

export type ParsedStep1StructuredResult = z.infer<typeof Step1StructuredSchema>;

export function projectStructuredStep1ToArchitecture(
  result: ParsedStep1StructuredResult,
): BusinessArchitecture {
  return {
    architecture: result.analysis_view.segments.map((segment) => ({
      segment: segment.canonical_name,
      businessLines: segment.offerings.map((offering) => ({
        name: offering.canonical_name,
        products: offering.products,
        customerType: offering.customer_type,
        dataSource: offering.claim_id,
      })),
    })),
    sources: result.sources.map((source) => ({
      document: source.document,
      section: source.section,
      page: source.page,
    })),
  };
}

export function parseStep1StructuredResult(payload: unknown): ParsedStep1StructuredResult {
  return Step1StructuredSchema.parse(payload);
}
