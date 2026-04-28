import { NextRequest, NextResponse } from "next/server";
import { callLLM, resolveApiKey } from "@/lib/llm-service";
import {
  GEMINI_STEP5_RESPONSE_SCHEMA,
  STEP5_RESPONSE_SCHEMA,
  buildStep5BaselineContext,
  parseStep5StructuredResult,
  projectStep5StructuredToProducts,
  reanchorStep5ForecastToBaselines,
} from "@/lib/step5-schema";
import type { LLMProvider } from "@/types/cfp";
import type { GenerateForecastResponse, ProductForecast } from "@/types/cfp";

// =============================================================================
// POST /api/generate-forecast
// =============================================================================

function parseProducts(raw: string): ProductForecast[] {
  const tryArr = (s: string) => {
    try { const p = JSON.parse(s); if (Array.isArray(p)) return p; } catch { /* skip */ }
    return null;
  };

  let r = tryArr(raw.trim());
  if (r) return r;

  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(raw)) !== null) { r = tryArr(m[1].trim()); if (r) return r; }

  const arr = raw.match(/\[[\s\S]*\]/);
  if (arr) { r = tryArr(arr[0]); if (r) return r; }

  return [];
}

function parseJsonObject(raw: string): unknown {
  const tryObj = (s: string) => {
    try {
      const parsed = JSON.parse(s);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch { /* skip */ }
    return null;
  };

  const direct = tryObj(raw.trim());
  if (direct) return direct;

  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fence.exec(raw)) !== null) {
    const fenced = tryObj(match[1].trim());
    if (fenced) return fenced;
  }

  const objectMatch = raw.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    const extracted = tryObj(objectMatch[0]);
    if (extracted) return extracted;
  }

  throw new Error("No JSON object found in model response.");
}

export async function POST(req: NextRequest): Promise<NextResponse<GenerateForecastResponse>> {
  try {
    const body = await req.json();
    const {
      step1Architecture,
      step2History,
      step3Competition,
      step4Complete,
      targetSegment,
      apiKey: runtimeKey,
      llmProvider = "claude" as LLMProvider,
    } = body;

    if (!step1Architecture || !targetSegment) {
      return NextResponse.json({ products: [], error: "Architecture and target segment are required." }, { status: 400 });
    }

    const { apiKey, needsKey } = resolveApiKey(llmProvider, runtimeKey);
    if (needsKey) {
      return NextResponse.json({ products: [], error: "No API key found for the selected provider.", requiresApiKey: true }, { status: 401 });
    }

    const baselineContext = buildStep5BaselineContext(step2History, [targetSegment]);

    const prompt = `Task: Produce the Step 5/6 v5.5 forecasting machine artifact for targetSegment: ${targetSegment}.

Use the full workflow context below. This is a workflow-safe forecast, not a narrative forecast.

Step 1 architecture:
${JSON.stringify(step1Architecture || {}, null, 2)}

Step 2 historical baseline:
${JSON.stringify(step2History || {}, null, 2)}

Step 3 competition review:
${JSON.stringify(step3Competition || {}, null, 2)}

Step 4 synergy and capital review:
${JSON.stringify(step4Complete || {}, null, 2)}

Authoritative Step 2 baseline anchors:
${JSON.stringify(baselineContext, null, 2)}

Rules:
- schema_version must be exactly "v5.5".
- Default forecast_mode to SEGMENT_ANNUAL.
- If Authoritative Step 2 baseline anchors are present, FY+1 must start from baselineRevenueUsdM compounded by the selected FY+1 growth rate. Do not estimate baseline share from total company revenue.
- Upgrade to SEGMENT_QUARTERLY or PRODUCT_QUARTERLY only when Step 2 disclosure supports that granularity and the requested segment needs it.
- Forecast only the requested targetSegment unless consolidated context is needed for a ceiling check.
- Every forecast row must cite at least one declared assumption_id.
- Every assumption that directly drives revenue must include arithmetic_trace.
- Do not use unsupported, context-only, or narrative-only synergies as numeric growth drivers.
- Weak or capped Step 4 drivers must use driver_quality "WEAK", appear in weak_inference_sensitivity, and set workflow_status to NEEDS_REVIEW when material.
- If Step 4 capital_allocation.step5_revenue_ceiling applies, keep FY5 base revenue below the ceiling or set workflow_status to NEEDS_REVIEW with a warning.
- Keep review_summary concise for UI display.
- No prose outside the structured response.`;

    const result = await callLLM({
      provider: llmProvider,
      apiKey,
      prompt,
      maxTokens: 16384,
      responseSchema:
        llmProvider === "gemini"
          ? GEMINI_STEP5_RESPONSE_SCHEMA
          : (STEP5_RESPONSE_SCHEMA as Record<string, unknown>),
      responseToolName: "submit_step5_structured_result",
      responseToolDescription: "Return the Step 5 v5.5 forecasting machine artifact.",
    });
    const rawText = result.text;

    let structuredResult;
    try {
      structuredResult = reanchorStep5ForecastToBaselines(
        parseStep5StructuredResult(result.structuredData ?? JSON.parse(rawText)),
        baselineContext,
      );
    } catch (error) {
      const legacyProducts = parseProducts(rawText);
      if (legacyProducts.length > 0) {
        return NextResponse.json({
          products: legacyProducts,
          error:
            "Model returned a legacy Step 5 array instead of the v5.5 machine artifact. Displaying legacy output, but regenerate before proceeding.",
        });
      }

      try {
        structuredResult = reanchorStep5ForecastToBaselines(
          parseStep5StructuredResult(parseJsonObject(rawText)),
          baselineContext,
        );
      } catch (fallbackError) {
        const detail = fallbackError instanceof Error ? fallbackError.message : "Unknown parse error.";
        const primary = error instanceof Error ? error.message : "";
        return NextResponse.json(
          {
            products: [],
            error: `Model did not return a valid Step 5 v5.5 machine artifact. ${detail || primary}`,
          },
          { status: 422 },
        );
      }
    }

    if (!structuredResult) {
      return NextResponse.json(
        { products: [], error: "Model did not return a valid Step 5 v5.5 machine artifact." },
        { status: 422 },
      );
    }

    const products = projectStep5StructuredToProducts(structuredResult, targetSegment);

    if (products.length === 0) {
      return NextResponse.json(
        {
          products: [],
          structuredResult,
          reviewSummary: structuredResult.review_summary,
          workflowStatus: structuredResult.machine_artifact.workflow_status,
          nextAction: structuredResult.machine_artifact.next_action,
          error: "Step 5 artifact did not include forecast rows for the requested segment.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      products,
      structuredResult,
      reviewSummary: structuredResult.review_summary,
      workflowStatus: structuredResult.machine_artifact.workflow_status,
      nextAction: structuredResult.machine_artifact.next_action,
    });
  } catch (err: unknown) {
    console.error("[generate-forecast] Error:", err);
    const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ products: [], error: msg }, { status: 500 });
  }
}
