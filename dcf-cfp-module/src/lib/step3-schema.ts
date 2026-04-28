import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type {
  CategoryCompetitionEntry,
  Step3ReviewState,
} from "../types/cfp.ts";

const EvidenceLevelSchema = z.enum([
  "DISCLOSED",
  "STRONG_INFERENCE",
  "WEAK_INFERENCE",
  "UNSUPPORTED",
]);

const ForceRatingSchema = z.enum(["Low", "Medium", "High"]);

const SourceQualitySchema = z.enum(["Official", "External", "Mixed", "Unverified"]);

const SourceSchema = z.object({
  source_id: z.string().min(1),
  source_type: z.enum([
    "official_filing",
    "competitor_filing",
    "company_release",
    "market_research",
    "news",
    "not_available",
  ]),
  name: z.string().min(1),
  url: z.string().min(1).nullable(),
  locator: z.string().min(1).nullable(),
  excerpt: z.string().min(1).transform((value) => value.slice(0, 260)).nullable(),
});

const ClaimSchema = z.object({
  claim_id: z.string().min(1),
  text: z.string().min(1).max(260),
  source_ids: z.array(z.string().min(1)).min(1),
  evidence_level: EvidenceLevelSchema,
  source_snippet: z.string().min(1).transform((value) => value.slice(0, 220)).nullable(),
});

const ForceDetailStructuredSchema = z.object({
  rating: ForceRatingSchema,
  justification: z.string().min(1).max(260),
  claim_id: z.string().min(1),
  source_ids: z.array(z.string().min(1)).min(1),
});

export const Step3CategorySchema = z.object({
  category_id: z.string().min(1),
  category: z.string().min(1),
  mapped_from_step1_ids: z.array(z.string().min(1)).min(1),
  materiality: z.enum(["HIGH", "MEDIUM", "LOW"]),
  primary_competitor: z.string().min(1),
  competitive_status: z.enum(["Leader", "Challenger", "Unclear"]),
  basis_for_pairing: z.string().min(1).max(320),
  basis_claim_ids: z.array(z.string().min(1)).min(1),
  source_ids: z.array(z.string().min(1)).min(1),
  source_quality: SourceQualitySchema,
  confidence: z.enum(["High", "Medium", "Low"]),
  human_review_required: z.boolean(),
  verification_note: z.string().min(1).max(320).nullable(),
  forces: z.object({
    rivalry: ForceDetailStructuredSchema,
    new_entrants: ForceDetailStructuredSchema,
    suppliers: ForceDetailStructuredSchema,
    buyers: ForceDetailStructuredSchema,
    substitutes: ForceDetailStructuredSchema,
  }),
});

const ValidationWarningSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["info", "warn", "high"]),
  message: z.string().min(1).max(260),
  category_ids: z.array(z.string().min(1)).default([]),
});

export const Step3StructuredSchema = z
  .object({
    schema_version: z.literal("v5.5"),
    company_name: z.string().min(1),
    review_summary: z.object({
      one_line: z.string().min(1).max(260),
      highlights: z.array(z.string().min(1).max(200)).default([]),
      warnings: z.array(z.string().min(1).max(200)).default([]),
    }),
    sources: z.array(SourceSchema),
    categories: z.array(Step3CategorySchema),
    claims: z.array(ClaimSchema),
    validation_warnings: z.array(ValidationWarningSchema).default([]),
  })
  .superRefine((payload, ctx) => {
    const sourceIds = new Set(payload.sources.map((source) => source.source_id));
    const claimIds = new Set(payload.claims.map((claim) => claim.claim_id));
    const categoryIds = new Set(payload.categories.map((category) => category.category_id));

    const ensureSourceIdsExist = (ids: string[], path: (string | number)[]) => {
      ids.forEach((sourceId, sourceIndex) => {
        if (!sourceIds.has(sourceId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, sourceIndex],
            message: `Unknown source_id "${sourceId}"`,
          });
        }
      });
    };

    const ensureClaimIdsExist = (ids: string[], path: (string | number)[]) => {
      ids.forEach((claimId, claimIndex) => {
        if (!claimIds.has(claimId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [...path, claimIndex],
            message: `Unknown claim_id "${claimId}"`,
          });
        }
      });
    };

    payload.claims.forEach((claim, claimIndex) => {
      ensureSourceIdsExist(claim.source_ids, ["claims", claimIndex, "source_ids"]);
    });

    payload.categories.forEach((category, categoryIndex) => {
      ensureSourceIdsExist(category.source_ids, ["categories", categoryIndex, "source_ids"]);
      ensureClaimIdsExist(category.basis_claim_ids, [
        "categories",
        categoryIndex,
        "basis_claim_ids",
      ]);

      Object.entries(category.forces).forEach(([forceName, force]) => {
        ensureClaimIdsExist([force.claim_id], [
          "categories",
          categoryIndex,
          "forces",
          forceName,
          "claim_id",
        ]);
        ensureSourceIdsExist(force.source_ids, [
          "categories",
          categoryIndex,
          "forces",
          forceName,
          "source_ids",
        ]);
      });
    });

    payload.validation_warnings.forEach((warning, warningIndex) => {
      warning.category_ids.forEach((categoryId, categoryIdIndex) => {
        if (!categoryIds.has(categoryId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["validation_warnings", warningIndex, "category_ids", categoryIdIndex],
            message: `Unknown category_id "${categoryId}"`,
          });
        }
      });
    });
  });

export type Step3StructuredResult = z.infer<typeof Step3StructuredSchema>;
export type Step3CategoryStructured = z.infer<typeof Step3CategorySchema>;

const generatedSchema = zodToJsonSchema(Step3StructuredSchema, "Step3StructuredResult");
const generatedCategorySchema = zodToJsonSchema(Step3CategorySchema, "Step3Category");

export const STEP3_RESPONSE_SCHEMA =
  "definitions" in generatedSchema && generatedSchema.definitions
    ? generatedSchema.definitions.Step3StructuredResult
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

export const GEMINI_STEP3_RESPONSE_SCHEMA = sanitizeSchemaForGemini(
  STEP3_RESPONSE_SCHEMA,
) as Record<string, unknown>;

export const STEP3_CATEGORY_RESPONSE_SCHEMA =
  "definitions" in generatedCategorySchema && generatedCategorySchema.definitions
    ? generatedCategorySchema.definitions.Step3Category
    : generatedCategorySchema;

export const GEMINI_STEP3_CATEGORY_RESPONSE_SCHEMA = sanitizeSchemaForGemini(
  STEP3_CATEGORY_RESPONSE_SCHEMA,
) as Record<string, unknown>;

function normalizeStep3StructuredPayload(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return payload;
  }

  const pickForce = (
    forceRecord: Record<string, unknown>,
    aliases: string[],
  ): unknown => {
    const normalizedEntries = Object.entries(forceRecord).map(([key, value]) => [
      normalizeKey(key),
      value,
    ] as const);

    for (const alias of aliases) {
      if (forceRecord[alias]) return forceRecord[alias];
      const normalizedAlias = normalizeKey(alias);
      const normalizedMatch = normalizedEntries.find(([key]) => key === normalizedAlias);
      if (normalizedMatch) return normalizedMatch[1];
    }
    return undefined;
  };

  const normalizeKey = (value: string): string => value.toLowerCase().replace(/[^a-z0-9]+/g, "");

  const pickString = (
    record: Record<string, unknown>,
    aliases: string[],
  ): unknown => {
    for (const alias of aliases) {
      const value = record[alias];
      if (typeof value === "string" && value.trim().length > 0) return value;
    }
    return undefined;
  };

  const pickStringArray = (
    record: Record<string, unknown>,
    aliases: string[],
  ): unknown => {
    for (const alias of aliases) {
      const value = record[alias];
      if (Array.isArray(value)) return value;
      if (typeof value === "string" && value.trim().length > 0) return [value];
    }
    return undefined;
  };

  const normalizeForceDetail = (force: unknown): unknown => {
    if (!force || typeof force !== "object" || Array.isArray(force)) {
      return force;
    }

    const forceDetailRecord = force as Record<string, unknown>;
    return {
      ...forceDetailRecord,
      rating:
        forceDetailRecord.rating ??
        pickString(forceDetailRecord, ["assessment", "level", "score", "risk", "force_rating", "forceRating"]),
      justification:
        forceDetailRecord.justification ??
        pickString(forceDetailRecord, ["rationale", "explanation", "reason", "analysis", "basis"]),
      claim_id:
        forceDetailRecord.claim_id ??
        pickString(forceDetailRecord, ["claimId", "claim", "basis_claim_id", "basisClaimId"]),
      source_ids:
        forceDetailRecord.source_ids ??
        pickStringArray(forceDetailRecord, ["sourceIds", "source_id", "sourceId", "sources"]),
    };
  };

  const record = payload as Record<string, unknown>;
  const defaultedWarnings: z.infer<typeof ValidationWarningSchema>[] = [];

  const stringArray = (value: unknown): string[] =>
    Array.isArray(value)
      ? value.filter((entry): entry is string => typeof entry === "string" && entry.trim().length > 0)
      : [];

  const buildDefaultForceDetail = (
    categoryRecord: Record<string, unknown>,
    forceLabel: string,
  ): z.infer<typeof ForceDetailStructuredSchema> => ({
    rating: "Medium",
    justification: `Model omitted ${forceLabel}; defaulted to Medium for human review.`,
    claim_id: stringArray(categoryRecord.basis_claim_ids)[0] ?? "",
    source_ids: stringArray(categoryRecord.source_ids),
  });

  const sourceIdsForForce = (
    forceRecord: Record<string, unknown>,
    categoryRecord: Record<string, unknown>,
  ): string[] => {
    const explicit = stringArray(forceRecord.source_ids);
    if (explicit.length > 0) return explicit;

    const categorySourceIds = stringArray(categoryRecord.source_ids);
    if (categorySourceIds.length > 0) return categorySourceIds;

    return [];
  };

  const normalizeForceSources = (
    force: unknown,
    categoryRecord: Record<string, unknown>,
    forceKey: string,
  ): unknown => {
    const normalized = normalizeForceDetail(force);
    if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
      return normalized;
    }

    const forceDetail = normalized as Record<string, unknown>;
    const sourceIds = sourceIdsForForce(forceDetail, categoryRecord);
    if (sourceIds.length > 0 && stringArray(forceDetail.source_ids).length === 0) {
      const categoryId =
        typeof categoryRecord.category_id === "string" ? categoryRecord.category_id : undefined;
      const categoryName =
        typeof categoryRecord.category === "string" ? categoryRecord.category : "category";
      defaultedWarnings.push({
        code: "PORTER_FORCE_SOURCE_DEFAULTED",
        severity: "warn",
        message: `${categoryName} ${forceKey} omitted source_ids. Defaulted to category-level sources for human review.`,
        category_ids: categoryId ? [categoryId] : [],
      });
      return {
        ...forceDetail,
        source_ids: sourceIds,
      };
    }

    return {
      ...forceDetail,
      source_ids: sourceIds,
    };
  };

  const normalizeOrDefaultForceDetail = (
    force: unknown,
    categoryRecord: Record<string, unknown>,
    forceLabel: string,
  ): unknown =>
    normalizeForceSources(force, categoryRecord, forceLabel) ??
    buildDefaultForceDetail(categoryRecord, forceLabel);

  const categories = Array.isArray(record.categories)
    ? record.categories.map((category) => {
        if (!category || typeof category !== "object" || Array.isArray(category)) {
          return category;
        }

        const categoryRecord = category as Record<string, unknown>;
        const forces = categoryRecord.forces;
        if (!forces || typeof forces !== "object" || Array.isArray(forces)) {
          return category;
        }

        const forceRecord = forces as Record<string, unknown>;
        const rivalry = pickForce(forceRecord, [
          "rivalry",
          "intensity_of_rivalry",
          "competitive_rivalry",
          "competitiveRivalry",
          "intensityOfRivalry",
          "Competitive Rivalry",
          "Rivalry Among Existing Competitors",
        ]);
        const newEntrants = pickForce(forceRecord, [
          "new_entrants",
          "newEntrants",
          "threat_of_new_entrants",
          "threatOfNewEntrants",
          "Threat of New Entrants",
          "New Entrants",
        ]);
        const suppliers = pickForce(forceRecord, [
          "suppliers",
          "supplier_power",
          "supplierPower",
          "bargaining_power_of_suppliers",
          "bargainingPowerOfSuppliers",
          "Bargaining Power of Suppliers",
          "Supplier Bargaining Power",
        ]);
        const buyers = pickForce(forceRecord, [
          "buyers",
          "buyer_power",
          "buyerPower",
          "bargaining_power_of_buyers",
          "bargainingPowerOfBuyers",
          "Bargaining Power of Buyers",
          "Buyer Bargaining Power",
        ]);
        const substitutes = pickForce(forceRecord, [
          "substitutes",
          "threat_of_substitutes",
          "threatOfSubstitutes",
          "Threat of Substitutes",
          "Threat of Substitute Products or Services",
        ]);
        const missingForceLabels = [
          ["rivalry", rivalry],
          ["new entrants", newEntrants],
          ["suppliers", suppliers],
          ["buyers", buyers],
          ["substitutes", substitutes],
        ].flatMap(([forceLabel, force]) => (force ? [] : [forceLabel as string]));
        const hasEmptyForceSources = [
          rivalry,
          newEntrants,
          suppliers,
          buyers,
          substitutes,
        ].some((force) => {
          const normalizedForce = normalizeForceDetail(force);
          return (
            normalizedForce &&
            typeof normalizedForce === "object" &&
            !Array.isArray(normalizedForce) &&
            stringArray((normalizedForce as Record<string, unknown>).source_ids).length === 0
          );
        });

        if (missingForceLabels.length > 0) {
          const categoryId =
            typeof categoryRecord.category_id === "string" ? categoryRecord.category_id : undefined;
          const categoryName =
            typeof categoryRecord.category === "string" ? categoryRecord.category : "category";
          defaultedWarnings.push({
            code: "PORTER_FORCE_DEFAULTED",
            severity: "warn",
            message: `Missing Porter forces for ${categoryName}: ${missingForceLabels.join(", ")}. Defaulted to Medium for human review.`,
            category_ids: categoryId ? [categoryId] : [],
          });
        }

        return {
          ...categoryRecord,
          human_review_required:
            missingForceLabels.length > 0 || hasEmptyForceSources
              ? true
              : categoryRecord.human_review_required,
          forces: {
            ...forceRecord,
            rivalry: normalizeOrDefaultForceDetail(rivalry, categoryRecord, "competitive rivalry"),
            new_entrants: normalizeOrDefaultForceDetail(
              newEntrants,
              categoryRecord,
              "threat of new entrants",
            ),
            suppliers: normalizeOrDefaultForceDetail(
              suppliers,
              categoryRecord,
              "supplier bargaining power",
            ),
            buyers: normalizeOrDefaultForceDetail(
              buyers,
              categoryRecord,
              "buyer bargaining power",
            ),
            substitutes: normalizeOrDefaultForceDetail(
              substitutes,
              categoryRecord,
              "threat of substitutes",
            ),
          },
        };
      })
    : record.categories;

  const existingWarnings = Array.isArray(record.validation_warnings)
    ? record.validation_warnings
    : [];

  return {
    ...record,
    categories,
    validation_warnings: [...existingWarnings, ...defaultedWarnings],
    schema_version: "v5.5",
  };
}

export function parseStep3StructuredResult(payload: unknown): Step3StructuredResult {
  return Step3StructuredSchema.parse(normalizeStep3StructuredPayload(payload));
}

export function parseStep3Category(payload: unknown): Step3CategoryStructured {
  return Step3CategorySchema.parse(payload);
}

export function projectStep3StructuredToCategories(
  result: Step3StructuredResult,
): CategoryCompetitionEntry[] {
  return result.categories.map((category) => ({
    category: category.category,
    primaryCompetitor: category.primary_competitor,
    competitiveStatus: category.competitive_status,
    basisForPairing: category.basis_for_pairing,
    forces: {
      rivalry: {
        rating: category.forces.rivalry.rating,
        justification: category.forces.rivalry.justification,
      },
      newEntrants: {
        rating: category.forces.new_entrants.rating,
        justification: category.forces.new_entrants.justification,
      },
      suppliers: {
        rating: category.forces.suppliers.rating,
        justification: category.forces.suppliers.justification,
      },
      buyers: {
        rating: category.forces.buyers.rating,
        justification: category.forces.buyers.justification,
      },
      substitutes: {
        rating: category.forces.substitutes.rating,
        justification: category.forces.substitutes.justification,
      },
    },
    verificationNote: category.verification_note ?? undefined,
    sourceQuality: category.source_quality,
    confidence: category.confidence,
  }));
}

export function buildStep3ReviewState(result: Step3StructuredResult): Step3ReviewState {
  return {
    workflowStatus: result.categories.some((category) => category.human_review_required)
      ? "needs_review"
      : "can_continue",
    approved: false,
    approvedAt: null,
    summary: {
      oneLine: result.review_summary.one_line,
      highlights: result.review_summary.highlights,
      warnings: result.review_summary.warnings,
    },
    categories: result.categories.map((category) => ({
      id: category.category_id,
      category: category.category,
      mappedFromStep1Ids: category.mapped_from_step1_ids,
      materiality: category.materiality,
      humanReviewRequired: category.human_review_required,
      sourceQuality: category.source_quality,
      confidence: category.confidence,
      verificationNote: category.verification_note,
      basisClaimIds: category.basis_claim_ids,
      sourceIds: category.source_ids,
      sources: category.source_ids
        .map((sourceId) => result.sources.find((source) => source.source_id === sourceId))
        .filter((source): source is Step3StructuredResult["sources"][number] => Boolean(source)),
      editable: {
        primaryCompetitor: category.primary_competitor,
        competitiveStatus: category.competitive_status,
        basisForPairing: category.basis_for_pairing,
      },
      forces: category.forces,
    })),
    validationWarnings: result.validation_warnings.map((warning) => ({
      code: warning.code,
      severity: warning.severity,
      message: warning.message,
      categoryIds: warning.category_ids,
    })),
  };
}
