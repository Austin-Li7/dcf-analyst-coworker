import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ExtractHistoryResponse } from "../types/cfp.ts";

const EvidenceLevelSchema = z.enum([
  "DISCLOSED",
  "STRONG_INFERENCE",
  "WEAK_INFERENCE",
  "UNSUPPORTED",
]);

const QuarterSchema = z.enum(["Q1", "Q2", "Q3", "Q4"]);

const SourceSchema = z.object({
  source_id: z.string().min(1),
  source_type: z.enum(["uploaded_file", "text_notes", "derived", "not_available"]),
  name: z.string().min(1),
  locator: z.string().min(1).nullable(),
  excerpt: z.string().min(1).max(220).nullable(),
});

const RowSchema = z.object({
  row_id: z.string().min(1),
  fiscal_year: z.number().int().min(1900).max(2100),
  quarter: QuarterSchema,
  segment: z.string().min(1),
  product_category: z.string().min(1),
  product_name: z.string().min(1),
  revenue_usd_m: z.number().nullable(),
  operating_income_usd_m: z.number().nullable(),
  mapped_from_step1_ids: z.array(z.string().min(1)).min(1),
  source_id: z.string().min(1),
  evidence_level: EvidenceLevelSchema,
  validation_status: z.enum([
    "verified_source",
    "needs_review",
    "external_verification_required",
    "unverified",
  ]),
  review_note: z.string().min(1).max(220),
});

const ExcludedItemSchema = z.object({
  label: z.string().min(1),
  reason: z.string().min(1).max(220),
  source_id: z.string().min(1).nullable(),
  evidence_level: EvidenceLevelSchema,
});

const ValidationWarningSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["info", "warn", "high"]),
  message: z.string().min(1).max(220),
  row_ids: z.array(z.string().min(1)).default([]),
});

export const Step2StructuredSchema = z
  .object({
    schema_version: z.literal("v5.5"),
    company_name: z.string().min(1),
    target_year: z.number().int().min(1900).max(2100),
    rows: z.array(RowSchema),
    sources: z.array(SourceSchema),
    excluded_items: z.array(ExcludedItemSchema).default([]),
    validation_warnings: z.array(ValidationWarningSchema).default([]),
    review_summary: z.object({
      one_line: z.string().min(1).max(240),
      highlights: z.array(z.string().min(1).max(180)).default([]),
      warnings: z.array(z.string().min(1).max(180)).default([]),
    }),
  })
  .superRefine((payload, ctx) => {
    const sourceIds = new Set(payload.sources.map((source) => source.source_id));
    const rowIds = new Set(payload.rows.map((row) => row.row_id));

    payload.rows.forEach((row, rowIndex) => {
      if (!sourceIds.has(row.source_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", rowIndex, "source_id"],
          message: `Unknown source_id "${row.source_id}"`,
        });
      }

      if (row.revenue_usd_m === null && row.operating_income_usd_m === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", rowIndex],
          message: "At least one financial metric must be present.",
        });
      }
    });

    payload.validation_warnings.forEach((warning, warningIndex) => {
      warning.row_ids.forEach((rowId, rowIdIndex) => {
        if (!rowIds.has(rowId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["validation_warnings", warningIndex, "row_ids", rowIdIndex],
            message: `Unknown row_id "${rowId}"`,
          });
        }
      });
    });
  });

export type Step2StructuredResult = z.infer<typeof Step2StructuredSchema>;

export function projectStep2StructuredToRows(
  result: Step2StructuredResult,
): ExtractHistoryResponse["rows"] {
  return result.rows.map((row) => {
    const source = result.sources.find((candidate) => candidate.source_id === row.source_id);
    const verified = row.validation_status === "verified_source";
    const missingMetrics = [
      row.revenue_usd_m === null ? "revenue" : "",
      row.operating_income_usd_m === null ? "operating income" : "",
    ].filter(Boolean);

    const reviewNote =
      missingMetrics.length > 0
        ? `${row.review_note} Missing ${missingMetrics.join(" and ")}; legacy table displays 0.`
        : row.review_note;

    return {
      fiscalYear: row.fiscal_year,
      quarter: row.quarter,
      segment: row.segment,
      productCategory: row.product_category,
      productName: row.product_name,
      revenue: row.revenue_usd_m,
      operatingIncome: row.operating_income_usd_m,
      notes: row.review_note,
      reviewStatus: verified ? "Review Access Data" : "External Verification Required",
      internalVerify: verified ? "Yes" : "No",
      sourceType:
        source?.source_type === "uploaded_file" || source?.source_type === "text_notes"
          ? "User Provided"
          : "Not Available",
      sourceName: source?.name ?? "Not available",
      sourceLink: source?.locator ?? "Not available",
      reviewNote,
    };
  });
}

const generatedSchema = zodToJsonSchema(Step2StructuredSchema, "Step2StructuredResult");

export const STEP2_RESPONSE_SCHEMA =
  "definitions" in generatedSchema && generatedSchema.definitions
    ? generatedSchema.definitions.Step2StructuredResult
    : generatedSchema;

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
    .filter(
      ([key]) =>
        ![
          "$schema",
          "$ref",
          "definitions",
          "const",
          "additionalProperties",
          "propertyNames",
        ].includes(key),
    )
    .map(([key, entryValue]) => {
      if (key === "type" && Array.isArray(entryValue)) {
        const nonNullTypes = entryValue.filter((typeName) => typeName !== "null");
        return [key, nonNullTypes[0] ?? "string"] as const;
      }

      if (key === "type" && entryValue === "null") {
        return [key, "string"] as const;
      }

      if (key === "anyOf" && Array.isArray(entryValue)) {
        const nonNullOptions = entryValue
          .filter(
            (option) =>
              !(option && typeof option === "object" && (option as Record<string, unknown>).type === "null"),
          )
          .map((option) => sanitizeSchemaForGemini(option));

        if (nonNullOptions.length === 1) {
          const option = nonNullOptions[0] as Record<string, unknown>;
          return ["type", option.type ?? "string"] as const;
        }

        return [key, nonNullOptions] as const;
      }

      return [key, sanitizeSchemaForGemini(entryValue)] as const;
    });

  const sanitized = Object.fromEntries(nextEntries) as Record<string, unknown>;

  if (Array.isArray(record.type) && record.type.includes("null")) {
    sanitized.nullable = true;
  }

  if (Array.isArray(sanitized.required)) {
    sanitized.required = sanitized.required.filter((entry) => typeof entry === "string");
  }

  return sanitized;
}

export const GEMINI_STEP2_RESPONSE_SCHEMA = sanitizeSchemaForGemini(
  STEP2_RESPONSE_SCHEMA,
) as Record<string, unknown>;

function normalizeStep2StructuredPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  return {
    ...(payload as Record<string, unknown>),
    schema_version: "v5.5",
  };
}

export function parseStep2StructuredResult(payload: unknown): Step2StructuredResult {
  return Step2StructuredSchema.parse(normalizeStep2StructuredPayload(payload));
}
