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
import type { AnalyzeCompanyResponse, Step1StructuredResult } from "@/types/cfp";

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

function buildStep1BootstrapPrompt(companyName: string, bootstrapPackageText: string): string {
  return [
    "Task: Produce the Step 1 structured result for company business architecture review.",
    `Company: ${companyName}`,
    "Input source: SEC Company Facts bootstrap package generated at runtime from public SEC APIs.",
    "Important limitations:",
    "- This bootstrap package is strongest for total-company financial baseline and source manifest.",
    "- If business_architecture_evidence.revenue_category_candidates is present, use it as official 10-K evidence for reported revenue/product categories instead of collapsing the company to Total Company.",
    "- If segment/product architecture is not explicitly present in the bootstrap package, mark the analysis as conservative and use weak inference only when necessary.",
    "- Do not invent exact product/segment disclosures. Prefer a compact Total Company or clearly supported public-company architecture over unsupported detail.",
    '- schema_version must be "v5.5".',
    "- include ticker when present in the bootstrap package.",
    "- reported_view is the source-native disclosure view; use Total Company when segment-level disclosure is unavailable.",
    "- analysis_view is the canonical downstream mapping, but must stay conservative and traceable.",
    "- Every analysis segment and offering must include mapped_from_reported_node_ids and a claim_id.",
    "- Every claim must include evidence_level and supporting source metadata when disclosed.",
    "- uncertain or unsupported items must go to excluded_items rather than being force-mapped.",
    "- Keep arrays compact: max 3 products per node/offering, max 2 raw_name_variants, short source snippets only.",
    "- Do not emit markdown, commentary, or prose outside the structured response.",
    "SEC bootstrap JSON begins below.",
    bootstrapPackageText,
  ].join("\n");
}

type BootstrapCandidate = {
  name?: unknown;
  category?: unknown;
  products?: unknown;
  customer_type?: unknown;
  evidence_level?: unknown;
  source_snippet?: unknown;
  source_location?: unknown;
};

type NormalizedBootstrapCandidate = {
  name: string;
  category: string;
  products: string[];
  customer_type: string;
  evidence_level: "DISCLOSED" | "STRONG_INFERENCE";
  source_snippet: string;
  source_location: string;
};

type ParsedBootstrapPackage = {
  company?: {
    name?: unknown;
    ticker?: unknown;
  };
  business_architecture_evidence?: {
    latest_annual_report?: {
      form?: unknown;
      filing_date?: unknown;
      url?: unknown;
    };
    revenue_category_candidates?: BootstrapCandidate[];
  };
};

function textOrFallback(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function bootstrapCandidates(bootstrapPackage: unknown): NormalizedBootstrapCandidate[] {
  if (!bootstrapPackage || typeof bootstrapPackage !== "object") return [];
  const candidates = (bootstrapPackage as ParsedBootstrapPackage).business_architecture_evidence
    ?.revenue_category_candidates;
  if (!Array.isArray(candidates)) return [];

  return candidates
    .filter((candidate) => typeof candidate?.name === "string" && candidate.name.trim())
    .map((candidate) => ({
      name: textOrFallback(candidate.name, "Unnamed category"),
      category: textOrFallback(candidate.category, "Business category"),
      products: Array.isArray(candidate.products)
        ? candidate.products.filter((product): product is string => typeof product === "string" && !!product.trim())
        : [],
      customer_type: textOrFallback(candidate.customer_type, "Not specified"),
      evidence_level:
        candidate.evidence_level === "STRONG_INFERENCE" ? "STRONG_INFERENCE" as const : "DISCLOSED" as const,
      source_snippet: textOrFallback(candidate.source_snippet, "Disclosed in latest annual report."),
      source_location: textOrFallback(candidate.source_location, "Latest annual report"),
    }));
}

function shouldReplaceTotalCompanyView(
  result: Step1StructuredResult,
  candidates: NormalizedBootstrapCandidate[],
): boolean {
  if (candidates.length < 2) return false;
  const segments = result.analysis_view.segments;
  if (segments.length !== 1) return false;
  const segmentName = segments[0]?.canonical_name.toLowerCase() ?? "";
  const offeringNames = segments[0]?.offerings.map((offering) => offering.canonical_name.toLowerCase()) ?? [];
  return (
    segmentName.includes("total company") ||
    offeringNames.length === 0 ||
    offeringNames.every((name) => name.includes("total company"))
  );
}

function replaceTotalCompanyWithBootstrapArchitecture(
  result: Step1StructuredResult,
  bootstrapPackage: unknown,
): Step1StructuredResult {
  const candidates = bootstrapCandidates(bootstrapPackage);
  if (!shouldReplaceTotalCompanyView(result, candidates)) return result;

  const parsedBootstrap = bootstrapPackage as ParsedBootstrapPackage;
  const filing = parsedBootstrap.business_architecture_evidence?.latest_annual_report;
  const sourceDocument = `${textOrFallback(filing?.form, "Latest annual report")} filed ${textOrFallback(filing?.filing_date, "unknown date")}`;
  const sourceSection = "Item 1 Business / revenue category evidence";
  const sourceUrl = textOrFallback(filing?.url, "SEC filing");

  const claims = candidates.map((candidate, index) => ({
    claim_id: `S1-AUTO-${String(index + 1).padStart(2, "0")}`,
    text: `${candidate.name} is disclosed as a material product, service, or revenue category in the latest annual report.`,
    source_snippet: candidate.source_snippet.slice(0, 180),
    source_location: candidate.source_location,
    evidence_level: candidate.evidence_level as "DISCLOSED" | "STRONG_INFERENCE",
  }));

  const reportedNodes = candidates.map((candidate, index) => ({
    id: `reported:${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    label: candidate.name,
    raw_name_variants: [candidate.name],
    products: candidate.products.slice(0, 3),
    customer_type: candidate.customer_type,
    claim_id: claims[index].claim_id,
    evidence_level: claims[index].evidence_level,
    children: [],
  }));

  const productCandidates = candidates.filter((candidate) => candidate.name !== "Services");
  const serviceCandidate = candidates.find((candidate) => candidate.name === "Services");
  const segments = [
    ...(productCandidates.length
      ? [
          {
            id: "segment:products",
            canonical_name: "Products",
            raw_name_variants: ["Products"],
            mapped_from_reported_node_ids: productCandidates.map((candidate) =>
              `reported:${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
            ),
            claim_id: claims[0].claim_id,
            evidence_level: "DISCLOSED" as const,
            offerings: productCandidates.map((candidate) => {
              const claim = claims[candidates.indexOf(candidate)];
              return {
                id: `offering:${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
                canonical_name: candidate.name,
                category: candidate.category,
                raw_name_variants: [candidate.name],
                mapped_from_reported_node_ids: [
                  `reported:${candidate.name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
                ],
                products: candidate.products.slice(0, 3),
                customer_type: candidate.customer_type,
                claim_id: claim.claim_id,
                evidence_level: claim.evidence_level,
              };
            }),
          },
        ]
      : []),
    ...(serviceCandidate
      ? [
          {
            id: "segment:services",
            canonical_name: "Services",
            raw_name_variants: ["Services"],
            mapped_from_reported_node_ids: ["reported:services"],
            claim_id: claims[candidates.indexOf(serviceCandidate)].claim_id,
            evidence_level: "DISCLOSED" as const,
            offerings: [
              {
                id: "offering:services",
                canonical_name: "Services",
                category: serviceCandidate.category,
                raw_name_variants: ["Services"],
                mapped_from_reported_node_ids: ["reported:services"],
                products: serviceCandidate.products.slice(0, 3),
                customer_type: serviceCandidate.customer_type,
                claim_id: claims[candidates.indexOf(serviceCandidate)].claim_id,
                evidence_level: claims[candidates.indexOf(serviceCandidate)].evidence_level,
              },
            ],
          },
        ]
      : []),
  ];

  return {
    ...result,
    reported_view: {
      view_type: "revenue_category",
      nodes: reportedNodes,
    },
    analysis_view: {
      segments,
      excluded_items: result.analysis_view.excluded_items.filter(
        (item) => !item.raw_name.toLowerCase().includes("product"),
      ),
      canonical_name_registry: Object.fromEntries(
        ["Products", "Services", ...candidates.map((candidate) => candidate.name)].map((name) => [name, name]),
      ),
    },
    claims: [...claims, ...result.claims.filter((claim) => !claim.claim_id.startsWith("S1-AUTO-"))].slice(0, 12),
    sources: [
      {
        document: sourceDocument,
        section: sourceSection,
        page: sourceUrl,
      },
      ...result.sources.filter((source) => source.document !== sourceDocument),
    ],
  };
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
    const bootstrapPackage = formData.get("bootstrapPackage");
    let parsedBootstrapPackage: ParsedBootstrapPackage | null = null;

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

    if (typeof bootstrapPackage === "string" && bootstrapPackage.trim()) {
      try {
        parsedBootstrapPackage = JSON.parse(bootstrapPackage) as ParsedBootstrapPackage;
        documentTexts.push(`--- SEC Company Facts Bootstrap Package ---\n${JSON.stringify(parsedBootstrapPackage, null, 2)}`);
      } catch {
        return NextResponse.json(
          {
            rawMarkdown: "",
            structuredResult: null,
            architectureJson: null,
            step1Review: null,
            error: "Invalid SEC bootstrap package JSON.",
          },
          { status: 400 },
        );
      }
    }

    if (documentTexts.length === 0) {
      return NextResponse.json(
        {
          rawMarkdown: "",
          structuredResult: null,
          architectureJson: null,
          step1Review: null,
          error: "A SEC bootstrap package or at least one PDF (10-K or 10-Q) is required.",
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
      prompt:
        typeof bootstrapPackage === "string" && bootstrapPackage.trim()
          ? buildStep1BootstrapPrompt(companyName.trim(), documentTexts.join("\n\n"))
          : buildStep1Prompt(companyName.trim(), documentTexts.join("\n\n")),
      maxTokens: STEP1_MAX_OUTPUT_TOKENS,
      responseSchema:
        llmProvider === "gemini" || llmProvider === "openai"
          ? GEMINI_STEP1_RESPONSE_SCHEMA
          : STEP1_RESPONSE_SCHEMA,
      responseToolName: "submit_step1_structured_result",
      responseToolDescription:
        "Submit the Step 1 structured result with reported_view, analysis_view, claims, and sources.",
    });

    const structuredPayload = extractStructuredPayload(result, llmProvider);
    const parsedStructuredResult = parseStep1StructuredResult(structuredPayload);
    const structuredResult = replaceTotalCompanyWithBootstrapArchitecture(
      parsedStructuredResult,
      parsedBootstrapPackage,
    );
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
