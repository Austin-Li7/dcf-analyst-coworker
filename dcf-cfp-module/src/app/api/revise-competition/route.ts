import { NextRequest, NextResponse } from "next/server";
import { callLLM, parseStructuredJsonText, resolveApiKey } from "@/lib/llm-service";
import {
  GEMINI_STEP3_CATEGORY_RESPONSE_SCHEMA,
  parseStep3Category,
  STEP3_CATEGORY_RESPONSE_SCHEMA,
} from "@/lib/step3-schema";
import type { LLMProvider } from "@/types/cfp";
import type {
  CategoryCompetitionEntry,
  ReviseCompetitionResponse,
  Step3StructuredCategory,
} from "@/types/cfp";

// =============================================================================
// POST /api/revise-competition
// =============================================================================
// Accepts JSON body:
//   - categoryData   (current CategoryCompetitionEntry object)
//   - userFeedback   (string)
//   - apiKey         (string, optional)
// =============================================================================

function projectStructuredCategoryToLegacy(
  category: Step3StructuredCategory,
): CategoryCompetitionEntry {
  return {
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
  };
}

function extractStructuredPayload(result: {
  text: string;
  structuredData?: unknown;
  finishReason?: string;
  finishMessage?: string;
}, provider: LLMProvider): unknown {
  if (result.structuredData && typeof result.structuredData === "object") {
    return result.structuredData;
  }

  return parseStructuredJsonText(result.text, {
    provider,
    finishReason: result.finishReason,
    finishMessage: result.finishMessage,
  });
}

export async function POST(req: NextRequest): Promise<NextResponse<ReviseCompetitionResponse>> {
  try {
    const body = await req.json();
    const {
      categoryData,
      structuredCategory,
      userFeedback,
      apiKey: runtimeKey,
      llmProvider = "claude" as LLMProvider,
    } = body;

    if ((!categoryData && !structuredCategory) || !userFeedback) {
      return NextResponse.json(
        { category: categoryData, error: "Category data and user feedback are required." },
        { status: 400 },
      );
    }

    const { apiKey, needsKey } = resolveApiKey(llmProvider, runtimeKey);
    if (needsKey) {
      return NextResponse.json(
        { category: categoryData, error: "No API key found for the selected provider.", requiresApiKey: true },
        { status: 401 },
      );
    }

    const categoryForRevision = structuredCategory ?? {
      category_id: `category:${String(categoryData.category ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      category: categoryData.category,
      mapped_from_step1_ids: ["legacy:unknown"],
      materiality: "HIGH",
      primary_competitor: categoryData.primaryCompetitor,
      competitive_status: categoryData.competitiveStatus,
      basis_for_pairing: categoryData.basisForPairing,
      basis_claim_ids: ["legacy:claim"],
      source_ids: ["legacy:source"],
      source_quality: categoryData.sourceQuality ?? "Unverified",
      confidence: categoryData.confidence ?? "Low",
      human_review_required: true,
      verification_note: categoryData.verificationNote ?? "Legacy category revised without full Step 3 source grounding.",
      forces: {
        rivalry: { ...categoryData.forces.rivalry, claim_id: "legacy:claim", source_ids: ["legacy:source"] },
        new_entrants: { ...categoryData.forces.newEntrants, claim_id: "legacy:claim", source_ids: ["legacy:source"] },
        suppliers: { ...categoryData.forces.suppliers, claim_id: "legacy:claim", source_ids: ["legacy:source"] },
        buyers: { ...categoryData.forces.buyers, claim_id: "legacy:claim", source_ids: ["legacy:source"] },
        substitutes: { ...categoryData.forces.substitutes, claim_id: "legacy:claim", source_ids: ["legacy:source"] },
      },
    };

    const prompt = [
      "You are refining one Step 3 v5.5 competitive landscape category based on user feedback.",
      "Current structured category:",
      JSON.stringify(categoryForRevision, null, 2),
      "User feedback/correction:",
      userFeedback,
      "Task:",
      "- Update only fields affected by the user feedback.",
      "- Preserve category_id, category, mapped_from_step1_ids, existing claim/source identifiers, and the structured shape.",
      "- Keep Review Prompt V2 honesty: if evidence is weak, lower confidence/source_quality and set human_review_required=true.",
      "- Competitor pairing must still be judged by direct overlap, revenue scale, and market position.",
      "- Return only the updated structured category matching the schema.",
    ].join("\n");

    const result = await callLLM({
      provider: llmProvider,
      apiKey,
      prompt,
      maxTokens: 4096,
      responseSchema:
        llmProvider === "gemini"
          ? GEMINI_STEP3_CATEGORY_RESPONSE_SCHEMA
          : STEP3_CATEGORY_RESPONSE_SCHEMA,
      responseToolName: "submit_step3_category_revision",
      responseToolDescription:
        "Submit the revised Step 3 structured category while preserving source grounding fields.",
    });

    const revisedStructuredCategory = parseStep3Category(
      extractStructuredPayload(result, llmProvider),
    );
    const category = projectStructuredCategoryToLegacy(revisedStructuredCategory);

    if (!category) {
      return NextResponse.json(
        { category: categoryData, error: "The model did not return a valid JSON object. Please try again." },
        { status: 422 },
      );
    }

    return NextResponse.json({ category, structuredCategory: revisedStructuredCategory });
  } catch (err: unknown) {
    console.error("[revise-competition] Error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      { category: null as unknown as CategoryCompetitionEntry, error: message },
      { status: 500 },
    );
  }
}
