import { NextRequest, NextResponse } from "next/server";
import { callLLM, resolveApiKey } from "@/lib/llm-service";
import type { LLMProvider } from "@/types/cfp";
import type { ReviseSynergiesResponse, CapabilityPenetrationPath } from "@/types/cfp";

// =============================================================================
// POST /api/revise-synergies
// =============================================================================

function parsePathObject(raw: string): CapabilityPenetrationPath | null {
  const tryParse = (str: string) => {
    try {
      const p = JSON.parse(str);
      if (p && typeof p === "object" && p.sourceBusiness) return p;
    } catch { /* skip */ }
    return null;
  };

  let result = tryParse(raw.trim());
  if (result) return result;

  const fenceRegex = /```(?:json)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = fenceRegex.exec(raw)) !== null) {
    result = tryParse(match[1].trim());
    if (result) return result;
  }

  const objMatch = raw.match(/\{[\s\S]*\}/);
  if (objMatch) {
    result = tryParse(objMatch[0]);
    if (result) return result;
  }

  return null;
}

export async function POST(req: NextRequest): Promise<NextResponse<ReviseSynergiesResponse>> {
  try {
    const body = await req.json();
    const { pathData, userFeedback, apiKey: runtimeKey, llmProvider = "claude" as LLMProvider } = body;

    if (!pathData || !userFeedback) {
      return NextResponse.json({ path: pathData, error: "Path data and feedback are required." }, { status: 400 });
    }

    const { apiKey, needsKey } = resolveApiKey(llmProvider, runtimeKey);
    if (needsKey) {
      return NextResponse.json({ path: pathData, error: "No API key found for the selected provider.", requiresApiKey: true }, { status: 401 });
    }

    const prompt = `Refine this capability penetration analysis based on user feedback. Keep the exact same JSON schema. Current Analysis: ${JSON.stringify(pathData)}. Feedback: ${userFeedback}.
Review Prompt V2 logic tests:
- Preserve or update synergyClassification and reviewRationale using the but-for test and reciprocity test.
- If the relationship is only adjacent profit with no functional interdependency, classify it as Adjacent Revenue.
- Do not treat management targets or hypothetical future outcomes as verified proof.
Return ONLY the updated JSON object. Do not modify the existing impactScore unless the user explicitly asks to change it.`;

    const result = await callLLM({ provider: llmProvider, apiKey, prompt, maxTokens: 4096 });
    const rawText = result.text;

    const path = parsePathObject(rawText);

    if (!path) {
      return NextResponse.json({ path: pathData, error: "Model did not return valid JSON." }, { status: 422 });
    }

    return NextResponse.json({ path });
  } catch (err: unknown) {
    console.error("[revise-synergies] Error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ path: null as unknown as CapabilityPenetrationPath, error: message }, { status: 500 });
  }
}
