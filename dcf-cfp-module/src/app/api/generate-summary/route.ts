import { NextRequest, NextResponse } from "next/server";
import { callLLM, resolveApiKey } from "@/lib/llm-service";
import type { LLMProvider } from "@/types/cfp";
import type { GenerateSummaryResponse, SummaryInsights } from "@/types/cfp";

// =============================================================================
// POST /api/generate-summary
// =============================================================================

function parseInsights(raw: string): SummaryInsights | null {
  const tryParse = (s: string) => {
    try {
      const p = JSON.parse(s);
      if (p && p.topEngines && p.conclusion) return p as SummaryInsights;
    } catch { /* skip */ }
    return null;
  };

  let r = tryParse(raw.trim());
  if (r) return r;

  const fence = /```(?:json)?\s*([\s\S]*?)```/gi;
  let m: RegExpExecArray | null;
  while ((m = fence.exec(raw)) !== null) { r = tryParse(m[1].trim()); if (r) return r; }

  const obj = raw.match(/\{[\s\S]*\}/);
  if (obj) { r = tryParse(obj[0]); if (r) return r; }

  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse<GenerateSummaryResponse>> {
  try {
    const body = await req.json();
    const {
      aggregatedTableData,
      step5ForecastArtifacts,
      step5ReviewWarnings,
      step3Competition,
      step4Complete,
      apiKey: runtimeKey,
      llmProvider = "claude" as LLMProvider,
    } = body;

    if (!aggregatedTableData) {
      return NextResponse.json(
        { insights: { topEngines: [], conclusion: { revenueShift: "", ecosystemResilience: "" } }, error: "Aggregated data required." },
        { status: 400 },
      );
    }

    const { apiKey, needsKey } = resolveApiKey(llmProvider, runtimeKey);
    if (needsKey) {
      return NextResponse.json(
        { insights: { topEngines: [], conclusion: { revenueShift: "", ecosystemResilience: "" } }, error: "No API key found for the selected provider.", requiresApiKey: true },
        { status: 401 },
      );
    }

    const prompt = `You are an elite Chief Investment Officer reviewing a completed 5-year financial model. Look at the provided aggregatedTableData.
Data: ${JSON.stringify(aggregatedTableData)}
Step 5 v5.5 forecast artifacts: ${JSON.stringify(step5ForecastArtifacts || [])}
Step 5 review warnings and audit flags: ${JSON.stringify(step5ReviewWarnings || [])}
Competition: ${JSON.stringify(step3Competition || {})}
Synergies & Capital: ${JSON.stringify(step4Complete || {})}
Task 1: Identify the Top 3 Growth Engines (Categories) based strictly on the highest CAGR in the data. Provide a 1-sentence explanation for why each is winning, referencing the provided competition and synergy data.
Task 2: Write a Summary Conclusion. Provide a 2-sentence 'Revenue Shift' insight (how the revenue mix mathematically shifts from FY1 to FY5) and a 2-sentence 'Ecosystem Resilience' insight.
Task 3: If Step 5 warnings or weak-inference flags are present, reflect uncertainty in the explanation without inventing new numbers.

CRITICAL OUTPUT FORMAT: Return ONLY a valid JSON object. Format: { "topEngines": [ { "name": "", "cagr": "", "explanation": "" } ], "conclusion": { "revenueShift": "", "ecosystemResilience": "" } }`;

    const result = await callLLM({ provider: llmProvider, apiKey, prompt, maxTokens: 4096 });
    const rawText = result.text;

    const insights = parseInsights(rawText);
    if (!insights) {
      return NextResponse.json(
        { insights: { topEngines: [], conclusion: { revenueShift: "", ecosystemResilience: "" } }, error: "Model did not return valid JSON." },
        { status: 422 },
      );
    }

    return NextResponse.json({ insights });
  } catch (err: unknown) {
    console.error("[generate-summary] Error:", err);
    const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      { insights: { topEngines: [], conclusion: { revenueShift: "", ecosystemResilience: "" } }, error: msg },
      { status: 500 },
    );
  }
}
