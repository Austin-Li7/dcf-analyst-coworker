import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { HistoricalData, ProductForecast } from "../types/cfp.ts";

const DriverQualitySchema = z.enum(["DISCLOSED", "STRONG", "WEAK", "ESTIMATED_BASE"]);
const ForecastModeSchema = z.enum(["SEGMENT_ANNUAL", "SEGMENT_QUARTERLY", "PRODUCT_QUARTERLY"]);

const ReviewSummarySchema = z.object({
  one_line: z.string().min(1).max(260),
  highlights: z.array(z.string().min(1).max(220)).default([]),
  warnings: z.array(z.string().min(1).max(220)).default([]),
});

const Step5AssumptionSchema = z.object({
  id: z.string().min(1),
  statement: z.string().min(1).max(320),
  basis_claim_ids: z.array(z.string().min(1)).default([]),
  driver_quality: DriverQualitySchema,
  driver_eligibility_source: z.string().min(1).max(260),
  arithmetic_trace: z.string().min(1).max(420),
  management_override_required: z.boolean(),
});

const Step5ForecastRowSchema = z.object({
  segment: z.string().min(1),
  category: z.string().min(1).default("Segment Forecast"),
  product: z.string().min(1).nullable().default(null),
  fiscal_year: z.string().min(1),
  quarter: z.string().min(1).nullable().default(null),
  revenue_low_usd_m: z.number().nonnegative(),
  revenue_base_usd_m: z.number().nonnegative(),
  revenue_high_usd_m: z.number().nonnegative(),
  yoy_growth_pct: z.number(),
  assumption_ids: z.array(z.string().min(1)).min(1),
  driver_quality: DriverQualitySchema,
  flags: z.array(z.string().min(1)).default([]),
});

const WeakInferenceSensitivitySchema = z.object({
  assumption_id: z.string().min(1),
  evidence_level: z.enum(["WEAK_INFERENCE", "WEAK", "ESTIMATED_BASE"]),
  if_removed_revenue_impact_usd_m: z.number(),
  fy5_impact_pct: z.number(),
  flag: z.string().min(1),
});

const ConfidenceSummarySchema = z.object({
  total_fy5_revenue_base_usd_m: z.number().nonnegative().nullable(),
  disclosed_driver_revenue_pct: z.number().min(0).max(100),
  strong_driver_revenue_pct: z.number().min(0).max(100),
  weak_driver_revenue_pct: z.number().min(0).max(100),
  high_uncertainty_flags: z.number().int().min(0),
});

export const Step5StructuredSchema = z
  .object({
    schema_version: z.literal("v5.5"),
    company_name: z.string().min(1),
    review_summary: ReviewSummarySchema,
    machine_artifact: z.object({
      forecast_mode: ForecastModeSchema,
      assumptions: z.array(Step5AssumptionSchema).min(1),
      forecast_table: z.array(Step5ForecastRowSchema).min(1),
      weak_inference_sensitivity: z.array(WeakInferenceSensitivitySchema).default([]),
      confidence_summary: ConfidenceSummarySchema,
      workflow_status: z.enum(["READY", "NEEDS_REVIEW", "BLOCKED"]),
      next_action: z.enum([
        "PROCEED_STEP7",
        "HUMAN_REVIEW_MAJOR_ASSUMPTION",
        "REGENERATE",
      ]),
    }),
  })
  .superRefine((payload, ctx) => {
    const assumptionIds = new Set(
      payload.machine_artifact.assumptions.map((assumption) => assumption.id),
    );

    payload.machine_artifact.forecast_table.forEach((row, rowIndex) => {
      row.assumption_ids.forEach((assumptionId, assumptionIndex) => {
        if (!assumptionIds.has(assumptionId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["machine_artifact", "forecast_table", rowIndex, "assumption_ids", assumptionIndex],
            message: `Unknown assumption_id "${assumptionId}"`,
          });
        }
      });

      if (row.revenue_low_usd_m > row.revenue_base_usd_m) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["machine_artifact", "forecast_table", rowIndex, "revenue_low_usd_m"],
          message: "Low revenue cannot exceed base revenue.",
        });
      }

      if (row.revenue_base_usd_m > row.revenue_high_usd_m) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["machine_artifact", "forecast_table", rowIndex, "revenue_high_usd_m"],
          message: "Base revenue cannot exceed high revenue.",
        });
      }
    });

    payload.machine_artifact.weak_inference_sensitivity.forEach((sensitivity, sensitivityIndex) => {
      if (!assumptionIds.has(sensitivity.assumption_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: [
            "machine_artifact",
            "weak_inference_sensitivity",
            sensitivityIndex,
            "assumption_id",
          ],
          message: `Unknown assumption_id "${sensitivity.assumption_id}"`,
        });
      }
    });
  });

export type Step5StructuredResult = z.infer<typeof Step5StructuredSchema>;

export interface Step5BaselineContextRow {
  targetSegment: string;
  baselineFiscalYear: number;
  baselineRevenueUsdM: number;
  matchQuality: "disclosed_exact" | "disclosed_alias" | "disclosed_sum";
  sourceLabel: string;
}

const generatedSchema = zodToJsonSchema(Step5StructuredSchema, "Step5StructuredResult");

export const STEP5_RESPONSE_SCHEMA =
  "definitions" in generatedSchema && generatedSchema.definitions
    ? generatedSchema.definitions.Step5StructuredResult
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

  if (
    Array.isArray(record.anyOf) &&
    record.anyOf.some(
      (option) =>
        option &&
        typeof option === "object" &&
        (option as Record<string, unknown>).type === "null",
    )
  ) {
    sanitized.nullable = true;
  }

  if (Array.isArray(sanitized.required)) {
    sanitized.required = sanitized.required.filter((entry) => typeof entry === "string");
  }

  return sanitized;
}

export const GEMINI_STEP5_RESPONSE_SCHEMA = sanitizeSchemaForGemini(
  STEP5_RESPONSE_SCHEMA,
) as Record<string, unknown>;

function normalizeStep5StructuredPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const record = payload as Record<string, unknown>;
  const rawMachineArtifact =
    record.machine_artifact ?? record.machineArtifact ?? {
      forecast_mode: record.forecast_mode,
      assumptions: record.assumptions,
      forecast_table: record.forecast_table,
      weak_inference_sensitivity: record.weak_inference_sensitivity,
      confidence_summary: record.confidence_summary,
      workflow_status: record.workflow_status,
      next_action: record.next_action,
    };
  const machineRecord =
    rawMachineArtifact && typeof rawMachineArtifact === "object" && !Array.isArray(rawMachineArtifact)
      ? rawMachineArtifact as Record<string, unknown>
      : {};
  const compositeDriverQualityWarnings: string[] = [];
  const normalizeDriverQuality = (value: unknown): unknown => {
    const normalized = normalizeEnumToken(value);
    if (typeof value === "string" && normalized === "WEAK") {
      const token = enumToken(value);
      if (
        token !== "WEAK" &&
        (token.includes("WEAK") || token.includes("STRONG_WEAK") || token.includes("ESTIMATED_BASE"))
      ) {
        compositeDriverQualityWarnings.push(value);
      }
    }
    return normalized;
  };
  const confidenceSummary = machineRecord.confidence_summary ?? machineRecord.confidenceSummary;
  const forecastTable = machineRecord.forecast_table ?? machineRecord.forecastTable;
  const normalizedForecastTable = Array.isArray(forecastTable)
    ? forecastTable.map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) return row;
        const rowRecord = row as Record<string, unknown>;
        return {
          ...rowRecord,
          fiscal_year: rowRecord.fiscal_year ?? rowRecord.fiscalYear,
          revenue_low_usd_m: rowRecord.revenue_low_usd_m ?? rowRecord.revenueLowUsdM,
          revenue_base_usd_m: rowRecord.revenue_base_usd_m ?? rowRecord.revenueBaseUsdM,
          revenue_high_usd_m: rowRecord.revenue_high_usd_m ?? rowRecord.revenueHighUsdM,
          yoy_growth_pct: rowRecord.yoy_growth_pct ?? rowRecord.yoyGrowthPct,
          assumption_ids: rowRecord.assumption_ids ?? rowRecord.assumptionIds,
          driver_quality: normalizeDriverQuality(rowRecord.driver_quality ?? rowRecord.driverQuality),
        };
      })
    : forecastTable;
  const assumptions = machineRecord.assumptions;
  const normalizedAssumptions = Array.isArray(assumptions)
    ? assumptions.map((assumption) => {
        if (!assumption || typeof assumption !== "object" || Array.isArray(assumption)) return assumption;
        const assumptionRecord = assumption as Record<string, unknown>;
        return {
          ...assumptionRecord,
          basis_claim_ids: assumptionRecord.basis_claim_ids ?? assumptionRecord.basisClaimIds ?? [],
          driver_quality: normalizeDriverQuality(
            assumptionRecord.driver_quality ?? assumptionRecord.driverQuality,
          ),
          driver_eligibility_source:
            assumptionRecord.driver_eligibility_source ?? assumptionRecord.driverEligibilitySource,
          arithmetic_trace: assumptionRecord.arithmetic_trace ?? assumptionRecord.arithmeticTrace,
          management_override_required:
            assumptionRecord.management_override_required ??
            assumptionRecord.managementOverrideRequired ??
            false,
        };
      })
    : assumptions;
  const weakSensitivity = machineRecord.weak_inference_sensitivity ?? machineRecord.weakInferenceSensitivity;
  const normalizedWeakSensitivity = Array.isArray(weakSensitivity)
    ? weakSensitivity.map((entry) => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return entry;
        const entryRecord = entry as Record<string, unknown>;
        return {
          ...entryRecord,
          assumption_id: entryRecord.assumption_id ?? entryRecord.assumptionId,
          evidence_level: normalizeEnumToken(entryRecord.evidence_level ?? entryRecord.evidenceLevel),
          if_removed_revenue_impact_usd_m:
            entryRecord.if_removed_revenue_impact_usd_m ?? entryRecord.ifRemovedRevenueImpactUsdM,
          fy5_impact_pct: entryRecord.fy5_impact_pct ?? entryRecord.fy5ImpactPct,
        };
      })
    : weakSensitivity;
  const normalizedConfidence =
    confidenceSummary && typeof confidenceSummary === "object" && !Array.isArray(confidenceSummary)
      ? {
          ...(confidenceSummary as Record<string, unknown>),
          total_fy5_revenue_base_usd_m:
            (confidenceSummary as Record<string, unknown>).total_fy5_revenue_base_usd_m ??
            (confidenceSummary as Record<string, unknown>).totalFy5RevenueBaseUsdM,
          disclosed_driver_revenue_pct:
            (confidenceSummary as Record<string, unknown>).disclosed_driver_revenue_pct ??
            (confidenceSummary as Record<string, unknown>).disclosedDriverRevenuePct ??
            0,
          strong_driver_revenue_pct:
            (confidenceSummary as Record<string, unknown>).strong_driver_revenue_pct ??
            (confidenceSummary as Record<string, unknown>).strongDriverRevenuePct ??
            0,
          weak_driver_revenue_pct:
            (confidenceSummary as Record<string, unknown>).weak_driver_revenue_pct ??
            (confidenceSummary as Record<string, unknown>).weakDriverRevenuePct ??
            0,
          high_uncertainty_flags:
            (confidenceSummary as Record<string, unknown>).high_uncertainty_flags ??
            (confidenceSummary as Record<string, unknown>).highUncertaintyFlags ??
            0,
        }
      : {
          total_fy5_revenue_base_usd_m: null,
          disclosed_driver_revenue_pct: 0,
          strong_driver_revenue_pct: 0,
          weak_driver_revenue_pct: 0,
          high_uncertainty_flags: 0,
        };
  const reviewSummary = record.review_summary ?? record.reviewSummary;
  const omittedWorkflowStatus =
    !machineRecord.workflow_status && !machineRecord.workflowStatus;
  const omittedNextAction =
    !machineRecord.next_action && !machineRecord.nextAction;
  const hasCompositeDriverQuality = compositeDriverQualityWarnings.length > 0;
  const normalizedReviewSummary =
    reviewSummary && typeof reviewSummary === "object" && !Array.isArray(reviewSummary)
      ? {
          ...(reviewSummary as Record<string, unknown>),
          warnings:
            omittedWorkflowStatus || omittedNextAction || hasCompositeDriverQuality
              ? Array.from(new Set([
                  ...(((reviewSummary as Record<string, unknown>).warnings as unknown[]) ?? []),
                  ...(omittedWorkflowStatus || omittedNextAction
                    ? ["MODEL_OMITTED_WORKFLOW_STATUS: Review-gated fallback applied before downstream use."]
                    : []),
                  ...(hasCompositeDriverQuality
                    ? ["MODEL_COMPOSITE_DRIVER_QUALITY: Composite driver quality labels were conservatively mapped to WEAK and require review."]
                    : []),
                ]))
              : (reviewSummary as Record<string, unknown>).warnings,
        }
      : reviewSummary;

  return {
    ...record,
    schema_version: "v5.5",
    review_summary: normalizedReviewSummary,
    machine_artifact: {
      ...machineRecord,
      forecast_mode: machineRecord.forecast_mode ?? machineRecord.forecastMode,
      assumptions: normalizedAssumptions,
      forecast_table: normalizedForecastTable,
      weak_inference_sensitivity: normalizedWeakSensitivity ?? [],
      confidence_summary: normalizedConfidence,
      workflow_status: hasCompositeDriverQuality
        ? "NEEDS_REVIEW"
        : machineRecord.workflow_status ?? machineRecord.workflowStatus ?? "NEEDS_REVIEW",
      next_action: hasCompositeDriverQuality
        ? "HUMAN_REVIEW_MAJOR_ASSUMPTION"
        : machineRecord.next_action ?? machineRecord.nextAction ?? "HUMAN_REVIEW_MAJOR_ASSUMPTION",
    },
  };
}

export function parseStep5StructuredResult(payload: unknown): Step5StructuredResult {
  return Step5StructuredSchema.parse(normalizeStep5StructuredPayload(payload));
}

function normalizedName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function normalizeEnumToken(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const token = enumToken(value);
  if (token.includes("WEAK")) return "WEAK";
  if (token === "ESTIMATED_BASE" || token === "ESTIMATED_BASELINE") return "ESTIMATED_BASE";
  return token;
}

function enumToken(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "");
}

function rowLabels(row: HistoricalData["rows"][number]): string[] {
  return [row.segment, row.productCategory, row.productName].map(normalizedName).filter(Boolean);
}

function isHardwareTarget(targetSegment: string): boolean {
  const target = normalizedName(targetSegment);
  return target.includes("hardware") || target.includes("product");
}

function isServicesTarget(targetSegment: string): boolean {
  return normalizedName(targetSegment).includes("service");
}

function segmentMatchesTarget(segment: string, targetSegment: string): boolean {
  const source = normalizedName(segment);
  const target = normalizedName(targetSegment);
  if (source === target) return true;
  if (isHardwareTarget(targetSegment) && source === "products") return true;
  if (isHardwareTarget(segment) && target === "products") return true;
  if (isServicesTarget(targetSegment) && source === "services") return true;
  return false;
}

function isHardwareDisclosureLabel(label: string): boolean {
  return [
    "products",
    "iphone",
    "mac",
    "ipad",
    "wearables home and accessories",
    "wearables home accessories",
  ].includes(label);
}

export function buildStep5BaselineContext(
  history: HistoricalData | null | undefined,
  targetSegments: string[],
): Step5BaselineContextRow[] {
  const rows = historicalRowsForBaseline(history);
  if (rows.length === 0) return [];

  const latestFiscalYear = Math.max(...rows.map((row) => row.fiscalYear));
  const latestRows = rows.filter((row) => row.fiscalYear === latestFiscalYear);

  return targetSegments.flatMap((targetSegment): Step5BaselineContextRow[] => {
    const target = normalizedName(targetSegment);
    const exactRows = latestRows.filter((row) => rowLabels(row).includes(target));
    if (exactRows.length > 1) {
      const total = exactRows.reduce((sum, row) => sum + (row.revenue ?? 0), 0);
      return [{
        targetSegment,
        baselineFiscalYear: latestFiscalYear,
        baselineRevenueUsdM: total,
        matchQuality: "disclosed_sum",
        sourceLabel: exactRows.map((row) => row.productName || row.productCategory || row.segment).join(" + "),
      }];
    }

    const exact = exactRows[0];
    if (exact && typeof exact.revenue === "number") {
      return [{
        targetSegment,
        baselineFiscalYear: latestFiscalYear,
        baselineRevenueUsdM: exact.revenue,
        matchQuality: "disclosed_exact",
        sourceLabel: exact.productName || exact.productCategory || exact.segment,
      }];
    }

    if (isServicesTarget(targetSegment)) {
      const services = latestRows.find((row) => rowLabels(row).includes("services"));
      if (services && typeof services.revenue === "number") {
        return [{
          targetSegment,
          baselineFiscalYear: latestFiscalYear,
          baselineRevenueUsdM: services.revenue,
          matchQuality: "disclosed_alias",
          sourceLabel: services.productName || services.productCategory || services.segment,
        }];
      }
    }

    if (isHardwareTarget(targetSegment)) {
      const products = latestRows.find((row) => rowLabels(row).includes("products"));
      if (products && typeof products.revenue === "number") {
        return [{
          targetSegment,
          baselineFiscalYear: latestFiscalYear,
          baselineRevenueUsdM: products.revenue,
          matchQuality: "disclosed_alias",
          sourceLabel: products.productName || products.productCategory || products.segment,
        }];
      }

      const hardwareRows = latestRows.filter((row) =>
        rowLabels(row).some((label) => isHardwareDisclosureLabel(label)),
      );
      const total = hardwareRows.reduce((sum, row) => sum + (row.revenue ?? 0), 0);
      if (total > 0) {
        return [{
          targetSegment,
          baselineFiscalYear: latestFiscalYear,
          baselineRevenueUsdM: total,
          matchQuality: "disclosed_sum",
          sourceLabel: hardwareRows.map((row) => row.productName || row.productCategory).join(" + "),
        }];
      }
    }

    return [];
  });
}

function historicalRowsForBaseline(
  history: HistoricalData | null | undefined,
): HistoricalData["rows"] {
  const structuredResults = history?.structuredResults ?? [];
  if (structuredResults.length > 0) {
    return structuredResults.flatMap((result) =>
      result.rows
        .filter((row) => typeof row.revenue_usd_m === "number")
        .map((row) => ({
          id: row.row_id,
          fiscalYear: row.fiscal_year,
          quarter: row.quarter,
          segment: row.segment,
          productCategory: row.product_category,
          productName: row.product_name,
          revenue: row.revenue_usd_m,
          yoyGrowth: 0,
          operatingIncome: row.operating_income_usd_m,
          notes: row.review_note,
          reviewStatus:
            row.validation_status === "verified_source"
              ? "Verified"
              : "External Verification Required",
          internalVerify: row.validation_status === "verified_source" ? "Yes" : "No",
          sourceType: "User Provided",
          sourceName:
            result.sources.find((source) => source.source_id === row.source_id)?.name ??
            "Step 2 structured artifact",
          sourceLink:
            result.sources.find((source) => source.source_id === row.source_id)?.locator ??
            "Not available",
          reviewNote: row.review_note,
        })),
    );
  }

  return history?.rows.filter((row) => typeof row.revenue === "number") ?? [];
}

function fiscalYearIndex(row: Step5StructuredResult["machine_artifact"]["forecast_table"][number]): number {
  return yearIndexFromFiscalYear(row.fiscal_year) ?? 1;
}

export function reanchorStep5ForecastToBaselines(
  result: Step5StructuredResult,
  baselines: Step5BaselineContextRow[],
): Step5StructuredResult {
  if (baselines.length === 0) return result;

  const runningBaseBySegment = new Map<string, number>();

  const forecastTable = [...result.machine_artifact.forecast_table]
    .sort((a, b) => a.segment.localeCompare(b.segment) || fiscalYearIndex(a) - fiscalYearIndex(b))
    .map((row) => {
      const baseline = baselines.find((candidate) => segmentMatchesTarget(row.segment, candidate.targetSegment));
      if (!baseline || result.machine_artifact.forecast_mode !== "SEGMENT_ANNUAL") return row;

      const priorBase = runningBaseBySegment.get(row.segment) ?? baseline.baselineRevenueUsdM;
      const newBase = Math.round(priorBase * (1 + row.yoy_growth_pct / 100) * 10) / 10;
      runningBaseBySegment.set(row.segment, newBase);

      const lowRatio = row.revenue_base_usd_m > 0 ? row.revenue_low_usd_m / row.revenue_base_usd_m : 0.95;
      const highRatio = row.revenue_base_usd_m > 0 ? row.revenue_high_usd_m / row.revenue_base_usd_m : 1.05;
      const flags = Array.from(new Set([...row.flags, "BASELINE_REANCHORED_TO_STEP2"]));

      return {
        ...row,
        revenue_low_usd_m: Math.round(newBase * lowRatio * 10) / 10,
        revenue_base_usd_m: newBase,
        revenue_high_usd_m: Math.round(newBase * highRatio * 10) / 10,
        flags,
      };
    });

  const originalOrder = result.machine_artifact.forecast_table.map((row, index) => ({ row, index }));
  const keyed = new Map(
    forecastTable.map((row) => [`${row.segment}|${row.category}|${row.fiscal_year}|${row.quarter ?? ""}`, row]),
  );

  return {
    ...result,
    review_summary: {
      ...result.review_summary,
      highlights: Array.from(new Set([
        ...result.review_summary.highlights,
        "Forecast baseline re-anchored to Step 2 latest disclosed revenue where available.",
      ])),
    },
    machine_artifact: {
      ...result.machine_artifact,
      forecast_table: originalOrder
        .sort((a, b) => a.index - b.index)
        .map(({ row }) =>
          keyed.get(`${row.segment}|${row.category}|${row.fiscal_year}|${row.quarter ?? ""}`) ?? row,
        ),
    },
  };
}

function yearIndexFromFiscalYear(fiscalYear: string): number | null {
  const plusMatch = fiscalYear.match(/FY\+?(\d+)/i);
  if (plusMatch) return Number(plusMatch[1]);

  const plainMatch = fiscalYear.match(/Y(?:ear)?\s*(\d+)/i);
  if (plainMatch) return Number(plainMatch[1]);

  return null;
}

function driverText(
  row: Step5StructuredResult["machine_artifact"]["forecast_table"][number],
  assumptionMap: Map<string, string>,
): string {
  const assumptions = row.assumption_ids
    .map((id) => `${id}: ${assumptionMap.get(id) ?? "Assumption not found"}`)
    .join(" | ");
  const flags = row.flags.length > 0 ? ` Flags: ${row.flags.join(", ")}` : "";
  return `${assumptions}${flags}`;
}

export function projectStep5StructuredToProducts(
  result: Step5StructuredResult,
  targetSegment?: string,
): ProductForecast[] {
  const artifact = result.machine_artifact;
  const assumptionMap = new Map(
    artifact.assumptions.map((assumption) => [assumption.id, assumption.statement] as const),
  );
  const rows = artifact.forecast_table.filter((row) =>
    targetSegment ? segmentMatchesTarget(row.segment, targetSegment) : true,
  );

  if (artifact.forecast_mode === "PRODUCT_QUARTERLY") {
    const grouped = new Map<string, typeof rows>();

    rows.forEach((row) => {
      const productName = row.product ?? `${row.segment} segment base case`;
      const key = `${row.segment}|${row.category}|${productName}`;
      grouped.set(key, [...(grouped.get(key) ?? []), row]);
    });

    return Array.from(grouped.entries()).map(([key, productRows]) => {
      const [, categoryName, productName] = key.split("|");
      const sortedRows = [...productRows].sort((a, b) => {
        const yearA = yearIndexFromFiscalYear(a.fiscal_year) ?? 0;
        const yearB = yearIndexFromFiscalYear(b.fiscal_year) ?? 0;
        const quarterA = Number((a.quarter ?? "Q1").replace(/\D/g, "")) || 1;
        const quarterB = Number((b.quarter ?? "Q1").replace(/\D/g, "")) || 1;
        return yearA - yearB || quarterA - quarterB;
      });

      return {
        productName,
        categoryName,
        forecast: sortedRows.slice(0, 20).map((row) => ({
          year: yearIndexFromFiscalYear(row.fiscal_year) ?? 1,
          quarter: row.quarter ?? "Q1",
          revenueM: Math.round(row.revenue_base_usd_m * 10) / 10,
          yoyGrowth: Math.round(row.yoy_growth_pct * 10) / 10,
          strategicDriver: driverText(row, assumptionMap),
        })),
      };
    });
  }

  const grouped = new Map<string, typeof rows>();
  rows.forEach((row) => {
    const key = `${row.segment}|${row.category}`;
    grouped.set(key, [...(grouped.get(key) ?? []), row]);
  });

  return Array.from(grouped.entries()).map(([key, annualRows]) => {
    const [segmentName, categoryName] = key.split("|");
    const annualByYear = new Map<number, (typeof annualRows)[number]>();

    annualRows.forEach((row) => {
      const yearIndex = yearIndexFromFiscalYear(row.fiscal_year);
      if (yearIndex && yearIndex >= 1 && yearIndex <= 5) {
        annualByYear.set(yearIndex, row);
      }
    });

    const forecast = Array.from({ length: 5 }, (_, yearOffset) => yearOffset + 1).flatMap(
      (year) => {
        const row = annualByYear.get(year) ?? annualRows[Math.min(year - 1, annualRows.length - 1)];
        const quarterlyRevenue = Math.round((row.revenue_base_usd_m / 4) * 10) / 10;

        return ["Q1", "Q2", "Q3", "Q4"].map((quarter) => ({
          year,
          quarter,
          revenueM: quarterlyRevenue,
          yoyGrowth: Math.round(row.yoy_growth_pct * 10) / 10,
          strategicDriver: driverText(row, assumptionMap),
        }));
      },
    );

    return {
      productName: `${segmentName} segment base case`,
      categoryName,
      forecast,
    };
  });
}
