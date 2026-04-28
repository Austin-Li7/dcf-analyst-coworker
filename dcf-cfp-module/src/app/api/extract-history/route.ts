import { NextRequest, NextResponse } from "next/server";
import * as XLSX from "xlsx";
import {
  buildStep2StructuredFromFixtureRecords,
  recordsFromDcfInputPayload,
} from "@/lib/step2-fixture-ingest";
import { callLLM, parseStructuredJsonText, resolveApiKey } from "@/lib/llm-service";
import {
  GEMINI_STEP2_RESPONSE_SCHEMA,
  parseStep2StructuredResult,
  projectStep2StructuredToRows,
  STEP2_RESPONSE_SCHEMA,
} from "@/lib/step2-schema";
import type { LLMProvider } from "@/types/cfp";
import type { ExtractHistoryResponse } from "@/types/cfp";

// =============================================================================
// POST /api/extract-history
// =============================================================================
// Accepts multipart/form-data:
//   - targetYear    (string, required) — e.g. "2023"
//   - architecture  (string, required) — JSON from Step 1
//   - dataFiles     (File[], up to 4)  — .xlsx, .csv, .json, or .txt
//   - textNotes     (string, optional) — free-text pasted by the user
//   - apiKey        (string, optional) — runtime key override
//   - llmProvider   ("claude" | "gemini")
//
// Pipeline:
//   Local file parsing (xlsx lib) → text representation → LLM with
//   native responseSchema (Gemini) → typed HistoricalExtractionRow[]
// =============================================================================

// ---------------------------------------------------------------------------
// Accepted file types
// ---------------------------------------------------------------------------
const XLSX_EXTS = new Set([".xlsx", ".xls", ".xlsm"]);
const CSV_EXTS = new Set([".csv"]);
const TXT_EXTS = new Set([".txt"]);
const JSON_EXTS = new Set([".json"]);

type ParsedFile = {
  name: string;
  content: string;
  records: Array<Record<string, unknown>>;
};

function fileExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot >= 0 ? name.slice(dot).toLowerCase() : "";
}

function companyNameFromArchitecture(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return String(parsed.company_name ?? parsed.companyName ?? "Unknown Company");
  } catch {
    return "Unknown Company";
  }
}

// ---------------------------------------------------------------------------
// Parse a single uploaded file → plain-text representation
// ---------------------------------------------------------------------------
async function parseFile(file: File): Promise<ParsedFile> {
  const ext = fileExtension(file.name);
  const buffer = Buffer.from(await file.arrayBuffer());

  if (TXT_EXTS.has(ext)) {
    return { name: file.name, content: buffer.toString("utf-8"), records: [] };
  }

  if (JSON_EXTS.has(ext)) {
    const content = buffer.toString("utf-8");
    const payload = JSON.parse(content);
    const records = recordsFromDcfInputPayload(payload);
    return {
      name: file.name,
      content: records.length > 0 ? JSON.stringify(records, null, 2) : content,
      records,
    };
  }

  if (XLSX_EXTS.has(ext) || CSV_EXTS.has(ext)) {
    const wb = XLSX.read(buffer, { type: "buffer" });
    const records: Array<Record<string, unknown>> = [];
    for (const sheetName of wb.SheetNames) {
      const ws = wb.Sheets[sheetName];
      records.push(...XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" }));
    }
    if (records.length === 0) {
      return { name: file.name, content: "(empty workbook)", records: [] };
    }
    return { name: file.name, content: JSON.stringify(records, null, 2), records };
  }

  throw new Error(`Unsupported file type: ${file.name} (${ext})`);
}

// ---------------------------------------------------------------------------
// Route handler
// ---------------------------------------------------------------------------
export async function POST(req: NextRequest): Promise<NextResponse<ExtractHistoryResponse>> {
  try {
    const formData = await req.formData();

    // ── Target year ─────────────────────────────────────────────────────────
    const targetYear = formData.get("targetYear");
    if (!targetYear || typeof targetYear !== "string" || !targetYear.trim()) {
      return NextResponse.json(
        { rows: [], error: "Target fiscal year is required." },
        { status: 400 },
      );
    }

    // ── Architecture from Step 1 ─────────────────────────────────────────────
    const architectureRaw = formData.get("architecture");
    if (!architectureRaw || typeof architectureRaw !== "string") {
      return NextResponse.json(
        { rows: [], error: "Step 1 architecture JSON is required." },
        { status: 400 },
      );
    }

    // ── Data files ───────────────────────────────────────────────────────────
    const dataFiles = formData.getAll("dataFiles").filter(
      (f): f is File => f instanceof File && f.size > 0,
    );

    // ── Optional free-text notes ─────────────────────────────────────────────
    const textNotes = (formData.get("textNotes") as string | null)?.trim() ?? "";

    if (dataFiles.length === 0 && !textNotes) {
      return NextResponse.json(
        { rows: [], error: "Please upload at least one data file or paste text notes." },
        { status: 400 },
      );
    }
    if (dataFiles.length > 4) {
      return NextResponse.json(
        { rows: [], error: "Maximum 4 files allowed per request." },
        { status: 400 },
      );
    }

    // ── Provider & API key ───────────────────────────────────────────────────
    const llmProvider = (formData.get("llmProvider") as LLMProvider) || "gemini";
    const runtimeKey = formData.get("apiKey") as string | null;

    // ── Parse all uploaded files locally ────────────────────────────────────
    const parsedSections: string[] = [];
    const parsedFiles: ParsedFile[] = [];

    for (const file of dataFiles) {
      try {
        const parsedFile = await parseFile(file);
        parsedFiles.push(parsedFile);
        parsedSections.push(`--- FILE: ${file.name} ---\n${parsedFile.content}`);
        console.log(
          `[extract-history] Parsed ${file.name} → ${parsedFile.content.length} chars`,
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.warn(`[extract-history] Skipping ${file.name}: ${msg}`);
      }
    }

    if (parsedSections.length === 0 && !textNotes) {
      return NextResponse.json(
        { rows: [], error: "Could not parse any of the uploaded files." },
        { status: 400 },
      );
    }

    if (textNotes) {
      parsedSections.push(`--- TEXT NOTES ---\n${textNotes}`);
    }

    const targetYearNumber = Number(targetYear.trim());
    for (const parsedFile of parsedFiles) {
      const fixtureResult = buildStep2StructuredFromFixtureRecords(
        parsedFile.records,
        targetYearNumber,
        parsedFile.name,
      );
      if (fixtureResult) {
        const rows = projectStep2StructuredToRows(fixtureResult);
        console.log(
          `[extract-history] Imported ${rows.length} fixture rows for FY ${targetYear}.`,
        );
        return NextResponse.json({ rows, structuredResult: fixtureResult });
      }
    }

    const { apiKey, needsKey } = resolveApiKey(llmProvider, runtimeKey ?? undefined);

    if (needsKey) {
      return NextResponse.json(
        { rows: [], error: "No API key found for the selected provider.", requiresApiKey: true },
        { status: 401 },
      );
    }

    // ── Build prompt ─────────────────────────────────────────────────────────
    const systemPrompt = [
      "You are producing the Step 2 historical financials contract for a DCF workflow.",
      "Return only a compact structured JSON object matching the provided schema.",
      'The top-level schema_version field must be exactly "v5.5".',
      "Do not invent financial values. Use null for unavailable revenue or operating income.",
      "Map rows only to Step 1 canonical analysis segments and offerings.",
      "Rows must include source_id, mapped_from_step1_ids, evidence_level, validation_status, and review_note.",
      "Keep review_note and excerpts short. No prose outside the structured response.",
    ].join(" ");

    const userPrompt = [
      "Task: Extract historical quarterly financial rows for the target fiscal year.",
      `Company: ${companyNameFromArchitecture(architectureRaw)}`,
      `Target Fiscal Year: ${targetYear.trim()}`,
      "Step 1 architecture input:",
      architectureRaw,
      "Rules:",
      "- Use canonical Step 1 names for segment/product mapping.",
      "- If a value is present in uploaded data, validation_status is verified_source.",
      "- If a value is missing or inferred, keep it null and add a validation warning.",
      "- Put geographic-only lines, subtotals, duplicate rows, and unmapped labels into excluded_items.",
      "- Units must be USD millions.",
      "Source data:",
      parsedSections.join("\n\n"),
    ].join("\n");

    // ── Call LLM with structured output ──────────────────────────────────────
    const result = await callLLM({
      provider: llmProvider,
      apiKey,
      prompt: userPrompt,
      systemPrompt,
      maxTokens: 16384,
      responseSchema:
        llmProvider === "gemini" ? GEMINI_STEP2_RESPONSE_SCHEMA : STEP2_RESPONSE_SCHEMA,
    });

    // ── Parse the response ───────────────────────────────────────────────────
    let structuredResult;

    try {
      const structuredPayload =
        result.structuredData && typeof result.structuredData === "object"
          ? result.structuredData
          : parseStructuredJsonText(result.text, {
              provider: llmProvider,
              finishReason: result.finishReason,
              finishMessage: result.finishMessage,
            });

      structuredResult = parseStep2StructuredResult(structuredPayload);
    } catch (err) {
      console.error("[extract-history] Failed to parse structured Step 2 response:", err);
      return NextResponse.json(
        {
          rows: [],
          structuredResult: null,
          error:
            err instanceof Error
              ? err.message
              : "The model did not return valid Step 2 structured JSON.",
        },
        { status: 422 },
      );
    }

    const rows = projectStep2StructuredToRows(structuredResult);

    console.log(`[extract-history] Extracted ${rows.length} rows for FY ${targetYear}.`);
    return NextResponse.json({ rows, structuredResult });
  } catch (err: unknown) {
    console.error("[extract-history] Unhandled error:", err);
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ rows: [], error: message }, { status: 500 });
  }
}
