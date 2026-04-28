import { NextRequest, NextResponse } from "next/server";
import { callLLM, parseStructuredJsonText, resolveApiKey } from "@/lib/llm-service";
import { extractPdfText } from "@/lib/pdf-extract";
import { buildStep1ReviewState } from "@/lib/step1-review";
import {
  GEMINI_STEP1_RESPONSE_SCHEMA,
  parseStep1StructuredResult,
  projectStructuredStep1ToArchitecture,
  STEP1_RESPONSE_SCHEMA,
} from "@/lib/step1-schema";
import type { LLMProvider } from "@/types/cfp";
import type { AnalyzeCompanyResponse } from "@/types/cfp";

const MAX_PAGES = 50;
const STEP1_MAX_OUTPUT_TOKENS = 32768;

const STEP1_SYSTEM_PROMPT = [
  "You are producing the Step 1 company profile contract for a DCF workflow.",
  "Return only data that can be justified from the provided filings.",
  "Be conservative: if mapping is uncertain, put it in excluded_items or reflect the uncertainty through evidence_level and claims.",
  "Do not assume every company fits a segment -> business line -> product hierarchy.",
  "reported_view must preserve the filing's disclosure structure exactly as the source-of-truth view.",
  "analysis_view must provide a normalized internal mapping for downstream steps, but every segment and offering must trace back to reported_view node ids and claims.",
  "Every reported node, analysis segment, offering, and excluded item must cite a claim_id that exists in claims.",
  "claims should capture the supporting text and evidence level. Use basis_claim_ids for inference chains.",
  "Treat official filings and company materials as the primary source tier; unsupported web-style summaries must not anchor the architecture.",
  "Check whether material reported segments, business lines, revenue categories, or explicitly disclosed product groups were omitted from the analysis view.",
  "If a source snippet or source location is unavailable, only use null when the evidence level is WEAK_INFERENCE or UNSUPPORTED.",
  "Keep the payload compact: source_snippet must be one short phrase, name variants should be minimal, and products should use at most three representative offerings.",
  "Keep Step 1 bounded for structured generation: prefer no more than 12 material claims, 8 reported nodes, 8 analysis offerings, and 6 excluded items unless omission would break downstream mapping.",
  "Do not enumerate every SKU, model, geography detail, reseller path, or long product description unless it materially changes the analysis mapping.",
  "Do not emit markdown, commentary, or prose outside the structured response.",
].join(" ");

function buildStep1Prompt(companyName: string, extractedPdfText: string): string {
  return [
    "Task: Produce the Step 1 structured result for company business architecture review.",
    `Company: ${companyName}`,
    "Contract requirements:",
    '- schema_version must be "v5.5".',
    "- include ticker when it is clearly identifiable from the company name or filings; use null when uncertain.",
    "- reported_view is the filing-native disclosure view and must work for operating segments, revenue categories, geography, or mixed structures.",
    "- analysis_view is the canonical downstream mapping, but must stay conservative and traceable.",
    "- Every analysis segment and offering must include mapped_from_reported_node_ids and a claim_id.",
    "- Every claim must include evidence_level and supporting source metadata when disclosed.",
    "- uncertain or unsupported items must go to excluded_items rather than being force-mapped.",
    "- preserve material omitted candidates in excluded_items when official disclosure mentions them but mapping is not strong enough.",
    "- prefer Tier 1 style evidence from filings, earnings releases, investor materials, and official product pages.",
    "- Step 1 is always review-gated, so preserve useful naming variants and provenance for human review.",
    "- Keep arrays compact: max 3 products per node/offering, max 2 raw_name_variants, short source snippets only.",
    "- Keep output compact enough to finish: target <=12 claims, <=8 reported nodes, <=8 analysis offerings, <=6 excluded items.",
    "- For reported_view, capture material filing-native structure without exhaustive leaf expansion.",
    "Document text begins below.",
    extractedPdfText,
  ].join("\n");
}

function formatStructuredResultForDisplay(payload: unknown): string {
  return `\`\`\`json\n${JSON.stringify(payload, null, 2)}\n\`\`\``;
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

export async function POST(req: NextRequest): Promise<NextResponse<AnalyzeCompanyResponse>> {
  try {
    const formData = await req.formData();

    const companyName = formData.get("companyName");
    if (!companyName || typeof companyName !== "string" || !companyName.trim()) {
      return NextResponse.json(
        {
          rawMarkdown: "",
          structuredResult: null,
          architectureJson: null,
          step1Review: null,
          error: "Company name is required.",
        },
        { status: 400 },
      );
    }

    const tenKFiles = formData.getAll("tenK");
    const tenQFiles = formData.getAll("tenQ");

    if (tenKFiles.length > 1) {
      return NextResponse.json(
        {
          rawMarkdown: "",
          structuredResult: null,
          architectureJson: null,
          step1Review: null,
          error: "Only one 10-K file is allowed per request.",
        },
        { status: 400 },
      );
    }

    if (tenQFiles.length > 1) {
      return NextResponse.json(
        {
          rawMarkdown: "",
          structuredResult: null,
          architectureJson: null,
          step1Review: null,
          error: "Only one 10-Q file is allowed per request.",
        },
        { status: 400 },
      );
    }

    const documentTexts: string[] = [];

    const parsePdfFile = async (file: FormDataEntryValue | null, label: string) => {
      if (!file || !(file instanceof File) || file.size === 0) return;
      const arrayBuffer = await file.arrayBuffer();
      const text = await extractPdfText(arrayBuffer, MAX_PAGES);
      if (text.trim()) {
        documentTexts.push(`--- ${label} ---\n${text}`);
      }
    };

    await parsePdfFile(tenKFiles[0] ?? null, "Form 10-K");
    await parsePdfFile(tenQFiles[0] ?? null, "Form 10-Q");

    if (documentTexts.length === 0) {
      return NextResponse.json(
        {
          rawMarkdown: "",
          structuredResult: null,
          architectureJson: null,
          step1Review: null,
          error: "At least one PDF (10-K or 10-Q) is required.",
        },
        { status: 400 },
      );
    }

    const runtimeKey = formData.get("apiKey") as string | null;
    const llmProvider = (formData.get("llmProvider") as LLMProvider) || "claude";
    const { apiKey, needsKey } = resolveApiKey(llmProvider, runtimeKey ?? undefined);

    if (needsKey) {
      return NextResponse.json(
        {
          rawMarkdown: "",
          structuredResult: null,
          architectureJson: null,
          step1Review: null,
          error: "No API key found for the selected provider.",
          requiresApiKey: true,
        },
        { status: 401 },
      );
    }

    const result = await callLLM({
      provider: llmProvider,
      apiKey,
      systemPrompt: STEP1_SYSTEM_PROMPT,
      prompt: buildStep1Prompt(companyName.trim(), documentTexts.join("\n\n")),
      maxTokens: STEP1_MAX_OUTPUT_TOKENS,
      responseSchema:
        llmProvider === "gemini"
          ? GEMINI_STEP1_RESPONSE_SCHEMA
          : STEP1_RESPONSE_SCHEMA,
      responseToolName: "submit_step1_structured_result",
      responseToolDescription:
        "Submit the Step 1 structured result with reported_view, analysis_view, claims, and sources.",
    });

    const structuredPayload = extractStructuredPayload(result, llmProvider);
    const structuredResult = parseStep1StructuredResult(structuredPayload);
    const architectureJson = projectStructuredStep1ToArchitecture(structuredResult);
    const step1Review = buildStep1ReviewState(structuredResult);

    return NextResponse.json({
      rawMarkdown: formatStructuredResultForDisplay(structuredResult),
      structuredResult,
      architectureJson,
      step1Review,
    });
  } catch (err: unknown) {
    console.error("[analyze-company] Error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      {
        rawMarkdown: "",
        structuredResult: null,
        architectureJson: null,
        step1Review: null,
        error: message,
      },
      { status: 500 },
    );
  }
}
