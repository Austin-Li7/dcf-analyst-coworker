import { NextRequest, NextResponse } from "next/server";
import { callLLM, parseStructuredJsonText, resolveApiKey } from "@/lib/llm-service";
import {
  buildStep4ReviewState,
  GEMINI_STEP4_RESPONSE_SCHEMA,
  parseStep4StructuredResult,
  projectStep4StructuredToCapital,
  projectStep4StructuredToPaths,
  STEP4_RESPONSE_SCHEMA,
} from "@/lib/step4-schema";
import type { LLMProvider } from "@/types/cfp";
import type { AnalyzeCapitalResponse, CapitalAllocationData } from "@/types/cfp";

// =============================================================================
// POST /api/analyze-capital
// =============================================================================

const emptyCapital: CapitalAllocationData = {
  investmentMatrix: [],
  checkpoints: { capexRunway: "", subsidiaryMargin: "", investmentEfficiency: "" },
};

const STEP4_CAPITAL_SYSTEM_PROMPT = [
  "You are revising the Step 4 Synergies and Step 4.5 Capital Allocation contract for a DCF workflow.",
  "Return only a compact structured JSON object matching the provided schema.",
  'The top-level schema_version field must be exactly "v5.5".',
  "Preserve the Step 4 synergy logic unless the capital/news evidence proves it should be downgraded.",
  "Every synergy and capital metric must cite claim_id and source_ids.",
  "Use Review Prompt V2: but-for test, reciprocity, source specificity, projection rule, and capex verification.",
  "Capital allocation must use PP&E purchases/capex-style lines where available, not total investing cash flow.",
  "Do not treat management targets, forecasts, or hypothetical future outcomes as verified proof.",
  "Include review_summary and validation_warnings suitable for a human review UI.",
  "No markdown, commentary, or prose outside the structured response.",
].join(" ");

function buildStep4CapitalPrompt(inputs: {
  step1Architecture: unknown;
  step2Financials: unknown;
  step4Synergies: unknown;
  recentNews: string;
}): string {
  return [
    "Task: Produce the finalized Step 4 Synergy & Driver Eligibility plus Step 4.5 Capital Allocation structured result.",
    `Recent news / management commentary: ${inputs.recentNews}`,
    "Step 1 architecture input:",
    JSON.stringify(inputs.step1Architecture, null, 2),
    "Step 2 historical financials input:",
    JSON.stringify(inputs.step2Financials || {}, null, 2),
    "Current Step 4 synergy review input:",
    JSON.stringify(inputs.step4Synergies || [], null, 2),
    "Review Prompt V2 capital requirements:",
    "- Use PP&E purchases / capex-specific lines. If unavailable, mark capital workflow_status NEEDS_REVIEW or BLOCKED.",
    "- Explain whether asset_light_exemption applies. If CapEx/Revenue evidence is insufficient, do not claim the exemption as verified.",
    "- Show whether Step 5 revenue ceiling applies, and include a null ceiling when no hard ceiling is supported.",
    "- Keep any source-grounding gaps in validation_warnings and human review fields.",
  ].join("\n");
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

export async function POST(req: NextRequest): Promise<NextResponse<AnalyzeCapitalResponse>> {
  try {
    const body = await req.json();
    const { step1Architecture, step2Financials, step4Synergies, recentNews, apiKey: runtimeKey, llmProvider = "claude" as LLMProvider } = body;

    if (!step1Architecture) {
      return NextResponse.json(
        { data: emptyCapital, error: "Step 1 architecture is required." },
        { status: 400 },
      );
    }

    const { apiKey, needsKey } = resolveApiKey(llmProvider, runtimeKey);
    if (needsKey) {
      return NextResponse.json(
        { data: emptyCapital, error: "No API key found for the selected provider.", requiresApiKey: true },
        { status: 401 },
      );
    }

    const newsBlock = recentNews && typeof recentNews === "string" && recentNews.trim()
      ? recentNews.trim()
      : "No recent news provided.";

    const result = await callLLM({
      provider: llmProvider,
      apiKey,
      systemPrompt: STEP4_CAPITAL_SYSTEM_PROMPT,
      prompt: buildStep4CapitalPrompt({
        step1Architecture,
        step2Financials,
        step4Synergies,
        recentNews: newsBlock,
      }),
      maxTokens: 12288,
      responseSchema:
        llmProvider === "gemini" ? GEMINI_STEP4_RESPONSE_SCHEMA : STEP4_RESPONSE_SCHEMA,
      responseToolName: "submit_step4_structured_result",
      responseToolDescription:
        "Submit the Step 4 structured synergy and capital allocation result with sources, claims, and review summary.",
    });

    const structuredPayload = extractStructuredPayload(result, llmProvider);
    const structuredResult = parseStep4StructuredResult(structuredPayload);
    const data = projectStep4StructuredToCapital(structuredResult);
    const paths = projectStep4StructuredToPaths(structuredResult);
    const step4Review = buildStep4ReviewState(structuredResult);

    if (data.investmentMatrix.length === 0) {
      return NextResponse.json(
        {
          data: emptyCapital,
          structuredResult: null,
          step4Review: null,
          error: "The model did not return any Step 4 capital metrics. Please try again.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({ data, paths, structuredResult, step4Review });
  } catch (err: unknown) {
    console.error("[analyze-capital] Error:", err);
    const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      { data: emptyCapital, error: msg },
      { status: 500 },
    );
  }
}
