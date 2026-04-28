import { NextRequest, NextResponse } from "next/server";
import { callLLM, resolveApiKey } from "@/lib/llm-service";
import type { LLMProvider } from "@/types/cfp";
import type { ReviseCapitalResponse, InvestmentMatrixEntry } from "@/types/cfp";

// =============================================================================
// POST /api/revise-capital
// =============================================================================

function parseEntry(raw: string): InvestmentMatrixEntry | null {
  const tryParse = (str: string) => {
    try {
      const p = JSON.parse(str);
      if (p && typeof p === "object" && p.pillar) return p as InvestmentMatrixEntry;
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

export async function POST(req: NextRequest): Promise<NextResponse<ReviseCapitalResponse>> {
  try {
    const body = await req.json();
    const { entryData, userFeedback, apiKey: runtimeKey, llmProvider = "claude" as LLMProvider } = body;

    if (!entryData || !userFeedback) {
      return NextResponse.json({ entry: entryData, error: "Entry data and feedback required." }, { status: 400 });
    }

    const { apiKey, needsKey } = resolveApiKey(llmProvider, runtimeKey);
    if (needsKey) {
      return NextResponse.json({ entry: entryData, error: "No API key found for the selected provider.", requiresApiKey: true }, { status: 401 });
    }

    const prompt = `Refine this capital allocation matrix entry based on user feedback. Keep the exact same JSON schema. Do not modify the existing efficiencyScore. Current Analysis: ${JSON.stringify(entryData)}. Feedback: ${userFeedback}. Return ONLY the updated JSON object.`;

    const result = await callLLM({ provider: llmProvider, apiKey, prompt, maxTokens: 4096 });
    const rawText = result.text;

    const entry = parseEntry(rawText);
    if (!entry) {
      return NextResponse.json({ entry: entryData, error: "Model did not return valid JSON." }, { status: 422 });
    }

    return NextResponse.json({ entry });
  } catch (err: unknown) {
    console.error("[revise-capital] Error:", err);
    const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ entry: null as unknown as InvestmentMatrixEntry, error: msg }, { status: 500 });
  }
}
