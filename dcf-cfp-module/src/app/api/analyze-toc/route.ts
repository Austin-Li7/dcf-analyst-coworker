import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { GoogleAIFileManager } from "@google/generative-ai/server";
import { resolveApiKey } from "@/lib/llm-service";
import type { LLMProvider } from "@/types/cfp";

// =============================================================================
// POST /api/analyze-toc
// =============================================================================
// Accepts multipart/form-data:
//   - pdf         (File, required) — the SEC filing PDF to scan
//   - apiKey      (string, optional) — runtime Gemini key override
//   - llmProvider (string) — must be "gemini"; Claude not supported here
//
// Pipeline:
//   1. Upload PDF to Google Files API (native PDF understanding, no OCR needed)
//   2. Run gemini-2.5-pro with responseSchema to locate Item 7 & Item 8 pages
//   3. Delete the uploaded file in a `finally` block (no storage leaks)
//   4. Return { startPage, endPage, reason }
// =============================================================================

export interface TocAnalysisResponse {
  startPage: number;
  endPage: number;
  reason: string;
  error?: string;
  requiresApiKey?: boolean;
}

// Structured output schema (JSON Schema format accepted by Gemini generationConfig)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RESPONSE_SCHEMA: Record<string, any> = {
  type: "object",
  properties: {
    startPage: {
      type: "number",
      description:
        "The physical page number (as printed in the document) where " +
        "Item 7 — Management's Discussion and Analysis — begins.",
    },
    endPage: {
      type: "number",
      description:
        "The physical page number where Item 8 — Financial Statements " +
        "and Supplementary Data — ends (i.e. the last page before the next Item).",
    },
    reason: {
      type: "string",
      description:
        "A concise 1-2 sentence explanation of where you found this information " +
        "in the Table of Contents (e.g. page numbers listed there).",
    },
  },
  required: ["startPage", "endPage", "reason"],
};

const TOC_SCAN_PROMPT =
  "You are a financial data assistant specializing in SEC filings. " +
  "Scan the Table of Contents of this document. " +
  "Identify the exact physical page numbers (as printed on the pages themselves, " +
  "not PDF viewer page numbers) where:\n" +
  "  • 'Item 7. Management's Discussion and Analysis of Financial Condition " +
  "and Results of Operations' BEGINS\n" +
  "  • 'Item 8. Financial Statements and Supplementary Data' ENDS\n" +
  "Return both page numbers and a brief reason explaining where you found them.";

// =============================================================================
// Route handler
// =============================================================================
export async function POST(req: NextRequest): Promise<NextResponse<TocAnalysisResponse>> {
  const EMPTY: TocAnalysisResponse = { startPage: 0, endPage: 0, reason: "" };

  try {
    const formData = await req.formData();

    // ── Validate PDF ─────────────────────────────────────────────────────────
    const pdfFile = formData.get("pdf");
    if (!(pdfFile instanceof File) || pdfFile.size === 0) {
      return NextResponse.json(
        { ...EMPTY, error: "A PDF file is required." },
        { status: 400 },
      );
    }

    // ── Provider guard — Gemini only (native PDF understanding) ──────────────
    const llmProvider = (formData.get("llmProvider") as LLMProvider) || "gemini";
    if (llmProvider !== "gemini") {
      return NextResponse.json(
        {
          ...EMPTY,
          error:
            "Table of Contents scanning requires a Gemini API key. " +
            "Please switch your provider to Gemini in Settings (⚙) and try again.",
        },
        { status: 400 },
      );
    }

    // ── Resolve API key ───────────────────────────────────────────────────────
    const runtimeKey = formData.get("apiKey") as string | null;
    const { apiKey, needsKey } = resolveApiKey("gemini", runtimeKey ?? undefined);
    if (needsKey) {
      return NextResponse.json(
        { ...EMPTY, error: "No Gemini API key found. Please add one in Settings.", requiresApiKey: true },
        { status: 401 },
      );
    }

    // ── Upload PDF to Google Files API ────────────────────────────────────────
    const fileManager = new GoogleAIFileManager(apiKey);
    const buffer = Buffer.from(await pdfFile.arrayBuffer());

    console.log(
      `[analyze-toc] Uploading "${pdfFile.name}" (${(pdfFile.size / 1024).toFixed(0)} KB) to Google Files API…`,
    );

    const uploadResponse = await fileManager.uploadFile(buffer, {
      mimeType: "application/pdf",
      displayName: pdfFile.name,
    });

    const uploadedFileName = uploadResponse.file.name; // used to delete afterwards
    const fileUri = uploadResponse.file.uri;

    console.log(`[analyze-toc] File uploaded as "${uploadedFileName}". Running gemini-2.5-pro ToC scan…`);

    // ── Run LLM analysis — always clean up the remote file ───────────────────
    try {
      const genAI = new GoogleGenerativeAI(apiKey);

      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-pro",
        generationConfig: {
          responseMimeType: "application/json",
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          responseSchema: RESPONSE_SCHEMA as any,
        },
      });

      const result = await model.generateContent([
        // The uploaded PDF is referenced by its URI — Gemini reads it natively
        {
          fileData: {
            mimeType: "application/pdf",
            fileUri,
          },
        },
        { text: TOC_SCAN_PROMPT },
      ]);

      const raw = result.response.text();
      console.log(`[analyze-toc] Raw response: ${raw.slice(0, 200)}`);

      const parsed = JSON.parse(raw) as TocAnalysisResponse;

      return NextResponse.json({
        startPage: Math.max(1, Math.round(Number(parsed.startPage) || 1)),
        endPage: Math.max(1, Math.round(Number(parsed.endPage) || 1)),
        reason: String(parsed.reason || "No reason provided."),
      });
    } finally {
      // Always delete — prevents Google storage quota leaks
      await fileManager.deleteFile(uploadedFileName).catch((err) =>
        console.warn(`[analyze-toc] Could not delete remote file "${uploadedFileName}":`, err),
      );
      console.log(`[analyze-toc] Deleted remote file "${uploadedFileName}".`);
    }
  } catch (err: unknown) {
    console.error("[analyze-toc] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ ...EMPTY, error: message }, { status: 500 });
  }
}
