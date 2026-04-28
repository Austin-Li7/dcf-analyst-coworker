# Step 2 v5.5 Structured Historical Financials Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade Step 2 from loose row extraction into a v5.5 structured historical financials contract that maps uploaded data to Step 1 canonical architecture, keeps source traceability, and stays compact enough for the weekend MVP.

**Architecture:** Step 2 will produce one canonical `Step2StructuredResult` containing validated quarterly rows, source records, excluded/unmapped items, validation warnings, and a compact review summary. The existing app will keep using `rows` for compatibility, but `/api/extract-history` will validate the structured result first and project rows from it. The Step 2 UI will remain a fast staging workflow, with evidence and validation detail collapsed by default.

**Tech Stack:** Next.js App Router API routes, TypeScript, Zod, Anthropic/Gemini via `callLLM`, `xlsx`, Node test runner.

---

## Product Principles

1. Step 2 must consume Step 1 canonical names, preferably `profile.step1StructuredResult`, with `architectureJson` only as compatibility fallback.
2. Step 2 must not invent historical data. Missing revenue or operating income should become `null`/excluded warnings, not fabricated zeroes.
3. Every extracted row must carry source support: source id/name, source type, source excerpt or cell reference when available, and validation status.
4. The UI must stay demo-friendly: default view is staging rows plus a short summary; source validation and excluded rows are expandable audit sections.
5. Existing downstream code must keep working through the old `rows` response shape.
6. Keep output compact. Do not ask the model to explain every mapping in prose.

---

## Current Code Context

**Important existing files:**
- `src/components/steps/Step2History.tsx`
- `src/app/api/extract-history/route.ts`
- `src/types/cfp.ts`
- `src/lib/llm-service.ts`
- `src/lib/step1-schema.ts`

**Current behavior:**
- UI sends `architecture: JSON.stringify(state.profile.architectureJson)`.
- API parses uploaded `.xlsx/.xls/.xlsm/.csv/.txt` files into text.
- API asks LLM for `{ rows: [...] }`.
- Client stages rows and user confirms them into `state.history`.

**Known gaps:**
- No Step 2 canonical structured result.
- No runtime Zod validation.
- No strong mapping to Step 1 `analysis_view`.
- Missing values are currently normalized to `0`, which can look like real data.
- Review metadata exists but is inconsistent and not a source-of-truth contract.

---

### Task 1: Define Step 2 Structured Schema and Compatibility Projection

**Files:**
- Create: `src/lib/step2-schema.ts`
- Create: `src/lib/step2-schema.test.mts`
- Modify: `package.json`

- [ ] **Step 1: Write the failing schema tests**

Create `src/lib/step2-schema.test.mts`:

```ts
import test from "node:test";
import assert from "node:assert/strict";

import {
  STEP2_RESPONSE_SCHEMA,
  Step2StructuredSchema,
  projectStep2StructuredToRows,
} from "./step2-schema.ts";

const validPayload = {
  schema_version: "v5.5",
  company_name: "Apple Inc.",
  target_year: 2025,
  rows: [
    {
      row_id: "row:2025:q1:products",
      fiscal_year: 2025,
      quarter: "Q1",
      segment: "Products",
      product_category: "Products",
      product_name: "Products",
      revenue_usd_m: 96200,
      operating_income_usd_m: null,
      mapped_from_step1_ids: ["segment:products"],
      source_id: "source:file:apple-q1",
      evidence_level: "DISCLOSED",
      validation_status: "verified_source",
      review_note: "Revenue is directly provided in uploaded source; operating income not disclosed.",
    },
  ],
  sources: [
    {
      source_id: "source:file:apple-q1",
      source_type: "uploaded_file",
      name: "apple-q1.csv",
      locator: "Sheet1 rows 2-4",
      excerpt: "Products, Q1 2025, 96200",
    },
  ],
  excluded_items: [
    {
      label: "Americas geography",
      reason: "Geographic line, not a Step 1 canonical analysis segment.",
      source_id: "source:file:apple-q1",
      evidence_level: "DISCLOSED",
    },
  ],
  validation_warnings: [
    {
      code: "MISSING_OPERATING_INCOME",
      severity: "warn",
      message: "Operating income is not provided for Products.",
      row_ids: ["row:2025:q1:products"],
    },
  ],
  review_summary: {
    one_line: "1 verified revenue row, 1 excluded item, operating income requires review.",
    highlights: ["Products revenue mapped to Step 1 canonical segment."],
    warnings: ["Operating income is missing."],
  },
};

test("parses valid Step 2 structured historical financials and projects legacy rows", () => {
  const parsed = Step2StructuredSchema.parse(validPayload);
  const rows = projectStep2StructuredToRows(parsed);

  assert.equal(parsed.schema_version, "v5.5");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].fiscalYear, 2025);
  assert.equal(rows[0].quarter, "Q1");
  assert.equal(rows[0].segment, "Products");
  assert.equal(rows[0].revenue, 96200);
  assert.equal(rows[0].operatingIncome, 0);
  assert.equal(rows[0].reviewStatus, "Review Access Data");
  assert.equal(rows[0].internalVerify, "Yes");
});

test("rejects rows without Step 1 mapping provenance", () => {
  const payload = structuredClone(validPayload);
  payload.rows[0].mapped_from_step1_ids = [];

  assert.throws(() => Step2StructuredSchema.parse(payload));
});

test("rejects rows whose source_id is not declared in sources", () => {
  const payload = structuredClone(validPayload);
  payload.rows[0].source_id = "source:missing";

  assert.throws(() => Step2StructuredSchema.parse(payload));
});

test("exports a response schema object for LLM structured output", () => {
  assert.equal(typeof STEP2_RESPONSE_SCHEMA, "object");
  assert.equal(STEP2_RESPONSE_SCHEMA.type, "object");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node --test src/lib/step2-schema.test.mts
```

Expected: FAIL because `src/lib/step2-schema.ts` does not exist.

- [ ] **Step 3: Implement the schema and projection**

Create `src/lib/step2-schema.ts`:

```ts
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import type { ExtractHistoryResponse } from "../types/cfp.ts";

const EvidenceLevelSchema = z.enum([
  "DISCLOSED",
  "STRONG_INFERENCE",
  "WEAK_INFERENCE",
  "UNSUPPORTED",
]);

const QuarterSchema = z.enum(["Q1", "Q2", "Q3", "Q4"]);

const SourceSchema = z.object({
  source_id: z.string().min(1),
  source_type: z.enum(["uploaded_file", "text_notes", "derived", "not_available"]),
  name: z.string().min(1),
  locator: z.string().min(1).nullable(),
  excerpt: z.string().min(1).max(220).nullable(),
});

const RowSchema = z.object({
  row_id: z.string().min(1),
  fiscal_year: z.number().int().min(1900).max(2100),
  quarter: QuarterSchema,
  segment: z.string().min(1),
  product_category: z.string().min(1),
  product_name: z.string().min(1),
  revenue_usd_m: z.number().nullable(),
  operating_income_usd_m: z.number().nullable(),
  mapped_from_step1_ids: z.array(z.string().min(1)).min(1),
  source_id: z.string().min(1),
  evidence_level: EvidenceLevelSchema,
  validation_status: z.enum([
    "verified_source",
    "needs_review",
    "external_verification_required",
    "unverified",
  ]),
  review_note: z.string().min(1).max(220),
});

const ExcludedItemSchema = z.object({
  label: z.string().min(1),
  reason: z.string().min(1).max(220),
  source_id: z.string().min(1).nullable(),
  evidence_level: EvidenceLevelSchema,
});

const ValidationWarningSchema = z.object({
  code: z.string().min(1),
  severity: z.enum(["info", "warn", "high"]),
  message: z.string().min(1).max(220),
  row_ids: z.array(z.string().min(1)).default([]),
});

export const Step2StructuredSchema = z
  .object({
    schema_version: z.literal("v5.5"),
    company_name: z.string().min(1),
    target_year: z.number().int().min(1900).max(2100),
    rows: z.array(RowSchema),
    sources: z.array(SourceSchema),
    excluded_items: z.array(ExcludedItemSchema).default([]),
    validation_warnings: z.array(ValidationWarningSchema).default([]),
    review_summary: z.object({
      one_line: z.string().min(1).max(240),
      highlights: z.array(z.string().min(1).max(180)).default([]),
      warnings: z.array(z.string().min(1).max(180)).default([]),
    }),
  })
  .superRefine((payload, ctx) => {
    const sourceIds = new Set(payload.sources.map((source) => source.source_id));
    const rowIds = new Set(payload.rows.map((row) => row.row_id));

    payload.rows.forEach((row, rowIndex) => {
      if (!sourceIds.has(row.source_id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", rowIndex, "source_id"],
          message: `Unknown source_id "${row.source_id}"`,
        });
      }

      if (row.revenue_usd_m === null && row.operating_income_usd_m === null) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["rows", rowIndex],
          message: "At least one financial metric must be present.",
        });
      }
    });

    payload.validation_warnings.forEach((warning, warningIndex) => {
      warning.row_ids.forEach((rowId, rowIdIndex) => {
        if (!rowIds.has(rowId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ["validation_warnings", warningIndex, "row_ids", rowIdIndex],
            message: `Unknown row_id "${rowId}"`,
          });
        }
      });
    });
  });

export type Step2StructuredResult = z.infer<typeof Step2StructuredSchema>;

export function projectStep2StructuredToRows(
  result: Step2StructuredResult,
): ExtractHistoryResponse["rows"] {
  return result.rows.map((row) => {
    const source = result.sources.find((candidate) => candidate.source_id === row.source_id);
    const verified = row.validation_status === "verified_source";

    return {
      fiscalYear: row.fiscal_year,
      quarter: row.quarter,
      segment: row.segment,
      productCategory: row.product_category,
      productName: row.product_name,
      revenue: row.revenue_usd_m ?? 0,
      operatingIncome: row.operating_income_usd_m ?? 0,
      notes: row.review_note,
      reviewStatus: verified ? "Review Access Data" : "External Verification Required",
      internalVerify: verified ? "Yes" : "No",
      sourceType:
        source?.source_type === "uploaded_file" || source?.source_type === "text_notes"
          ? "User Provided"
          : "Not Available",
      sourceName: source?.name ?? "Not available",
      sourceLink: source?.locator ?? "Not available",
      reviewNote: row.review_note,
    };
  });
}

const generatedSchema = zodToJsonSchema(Step2StructuredSchema, "Step2StructuredResult");

export const STEP2_RESPONSE_SCHEMA =
  "definitions" in generatedSchema && generatedSchema.definitions
    ? generatedSchema.definitions.Step2StructuredResult
    : generatedSchema;

export function parseStep2StructuredResult(payload: unknown): Step2StructuredResult {
  return Step2StructuredSchema.parse(payload);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run:

```bash
node --test src/lib/step2-schema.test.mts
```

Expected: PASS.

- [ ] **Step 5: Add test to package script**

Modify `package.json` test script to include `src/lib/step2-schema.test.mts`:

```json
"test": "node --test src/lib/step1-review.test.mts src/lib/step1-schema.test.mts src/lib/llm-service.test.mts src/lib/step2-schema.test.mts"
```

Run:

```bash
npm test
```

Expected: all tests pass.

---

### Task 2: Extend Types for Step 2 Structured Response

**Files:**
- Modify: `src/types/cfp.ts`

- [ ] **Step 1: Add Step 2 structured types**

Modify `src/types/cfp.ts` near the Step 2 section:

```ts
export type Step2EvidenceLevel =
  | "DISCLOSED"
  | "STRONG_INFERENCE"
  | "WEAK_INFERENCE"
  | "UNSUPPORTED";

export type Step2ValidationStatus =
  | "verified_source"
  | "needs_review"
  | "external_verification_required"
  | "unverified";

export interface Step2Source {
  source_id: string;
  source_type: "uploaded_file" | "text_notes" | "derived" | "not_available";
  name: string;
  locator: string | null;
  excerpt: string | null;
}

export interface Step2HistoricalRow {
  row_id: string;
  fiscal_year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  segment: string;
  product_category: string;
  product_name: string;
  revenue_usd_m: number | null;
  operating_income_usd_m: number | null;
  mapped_from_step1_ids: string[];
  source_id: string;
  evidence_level: Step2EvidenceLevel;
  validation_status: Step2ValidationStatus;
  review_note: string;
}

export interface Step2ExcludedItem {
  label: string;
  reason: string;
  source_id: string | null;
  evidence_level: Step2EvidenceLevel;
}

export interface Step2ValidationWarning {
  code: string;
  severity: "info" | "warn" | "high";
  message: string;
  row_ids: string[];
}

export interface Step2StructuredResult {
  schema_version: "v5.5";
  company_name: string;
  target_year: number;
  rows: Step2HistoricalRow[];
  sources: Step2Source[];
  excluded_items: Step2ExcludedItem[];
  validation_warnings: Step2ValidationWarning[];
  review_summary: {
    one_line: string;
    highlights: string[];
    warnings: string[];
  };
}
```

- [ ] **Step 2: Update API response type**

Modify `ExtractHistoryResponse`:

```ts
export interface ExtractHistoryResponse {
  rows: Omit<HistoricalExtractionRow, "id" | "yoyGrowth">[];
  structuredResult?: Step2StructuredResult | null;
  error?: string;
  requiresApiKey?: boolean;
}
```

- [ ] **Step 3: Run typecheck**

Run:

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: PASS.

---

### Task 3: Refactor `/api/extract-history` to Validate Structured Result First

**Files:**
- Modify: `src/app/api/extract-history/route.ts`
- Modify: `src/lib/step2-schema.ts` if Gemini schema cleanup is needed

- [ ] **Step 1: Update imports**

Add imports to `src/app/api/extract-history/route.ts`:

```ts
import {
  parseStep2StructuredResult,
  projectStep2StructuredToRows,
  STEP2_RESPONSE_SCHEMA,
} from "@/lib/step2-schema";
import { parseStructuredJsonText } from "@/lib/llm-service";
```

Change the existing LLM import:

```ts
import { callLLM, parseStructuredJsonText, resolveApiKey } from "@/lib/llm-service";
```

- [ ] **Step 2: Replace local `EXTRACTION_RESPONSE_SCHEMA` usage**

Keep the old constant temporarily if TypeScript references require it, but use `STEP2_RESPONSE_SCHEMA` for new calls:

```ts
responseSchema: STEP2_RESPONSE_SCHEMA,
```

Do this for both Gemini and Claude. `callLLM` already supports Claude tool schemas through `responseSchema`.

- [ ] **Step 3: Update prompt to request compact v5.5 object**

Replace the extraction prompt block with:

```ts
const systemPrompt = [
  "You are producing the Step 2 historical financials contract for a DCF workflow.",
  "Return only a compact structured JSON object matching the provided schema.",
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
  parsedSections.join("\\n\\n"),
].join("\\n");
```

Add this helper above `POST`:

```ts
function companyNameFromArchitecture(raw: string): string {
  try {
    const parsed = JSON.parse(raw);
    return String(parsed.company_name ?? parsed.companyName ?? "Unknown Company");
  } catch {
    return "Unknown Company";
  }
}
```

- [ ] **Step 4: Parse structured result instead of loose rows**

Replace the current `try { const parsed = JSON.parse(...) }` block with:

```ts
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
      error: err instanceof Error ? err.message : "The model did not return valid Step 2 structured JSON.",
    },
    { status: 422 },
  );
}

const rows = projectStep2StructuredToRows(structuredResult);
```

- [ ] **Step 5: Return compatibility rows plus structured result**

Replace:

```ts
return NextResponse.json({ rows });
```

with:

```ts
return NextResponse.json({ rows, structuredResult });
```

- [ ] **Step 6: Run focused checks**

Run:

```bash
node node_modules/typescript/bin/tsc --noEmit
npm test
```

Expected: both pass.

---

### Task 4: Send Step 1 Structured Result from the Step 2 UI

**Files:**
- Modify: `src/components/steps/Step2History.tsx`

- [ ] **Step 1: Change architecture gate**

Replace:

```ts
const hasArchitecture = !!state.profile.architectureJson;
```

with:

```ts
const step1Input = state.profile.step1StructuredResult ?? state.profile.architectureJson;
const hasArchitecture = !!step1Input;
```

- [ ] **Step 2: Send structured Step 1 when available**

Replace:

```ts
formData.append("architecture", JSON.stringify(state.profile.architectureJson));
```

with:

```ts
formData.append("architecture", JSON.stringify(step1Input));
```

- [ ] **Step 3: Update hook dependency**

Replace `state.profile.architectureJson` in the `handleExtract` dependency array with `step1Input`.

- [ ] **Step 4: Store returned structured result locally for review**

Add state near `stagingRows`:

```ts
const [structuredResult, setStructuredResult] = useState<ExtractHistoryResponse["structuredResult"]>(null);
```

After successful API response:

```ts
setStructuredResult(data.structuredResult ?? null);
```

When clearing/confirming:

```ts
setStructuredResult(null);
```

- [ ] **Step 5: Run typecheck**

Run:

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: PASS.

---

### Task 5: Add Compact Step 2 Review UI

**Files:**
- Modify: `src/components/steps/Step2History.tsx`

- [ ] **Step 1: Add compact review cards above staging table**

Add this component near `SegmentGroup`:

```tsx
function Step2ReviewSummary({
  result,
}: {
  result: ExtractHistoryResponse["structuredResult"];
}) {
  if (!result) return null;

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">Step 2 Review Gate</p>
          <p className="mt-1 text-sm text-zinc-400">{result.review_summary.one_line}</p>
        </div>
        <span className="rounded-full bg-amber-600/15 px-3 py-1 text-xs font-semibold text-amber-300">
          Review extracted rows
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
          {result.rows.length} extracted row(s)
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
          {result.sources.length} source(s)
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
          {result.validation_warnings.length} warning(s)
        </div>
      </div>

      {result.review_summary.warnings.length > 0 && (
        <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-200">
          {result.review_summary.warnings.slice(0, 3).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <details className="rounded-lg border border-zinc-800 bg-zinc-950">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-300 hover:text-zinc-100">
          Source and excluded item audit
        </summary>
        <div className="space-y-3 border-t border-zinc-800 p-4 text-xs text-zinc-400">
          {result.sources.slice(0, 6).map((source) => (
            <p key={source.source_id}>
              {source.name}: {source.locator ?? "No locator"}
            </p>
          ))}
          {result.excluded_items.slice(0, 6).map((item) => (
            <p key={`${item.label}-${item.reason}`} className="text-amber-300/80">
              Excluded: {item.label} - {item.reason}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}
```

- [ ] **Step 2: Render it when staging rows exist**

Inside the staging area, before the staging table, add:

```tsx
<Step2ReviewSummary result={structuredResult} />
```

- [ ] **Step 3: Keep staging table editable**

Do not remove the existing staging table. It is the MVP human review mechanism.

- [ ] **Step 4: Run build**

Run:

```bash
node node_modules/next/dist/bin/next build --webpack
```

Expected: PASS.

---

### Task 6: Tighten Missing Value Semantics

**Files:**
- Modify: `src/lib/step2-schema.ts`
- Modify: `src/app/api/extract-history/route.ts`
- Modify: `src/components/steps/Step2History.tsx`

- [ ] **Step 1: Preserve null inside structured result**

Do not convert `null` to `0` inside `Step2StructuredResult`. Only `projectStep2StructuredToRows` may convert to `0` for legacy compatibility.

- [ ] **Step 2: Flag legacy zero conversions in review note**

In `projectStep2StructuredToRows`, change `reviewNote`:

```ts
const missingMetrics = [
  row.revenue_usd_m === null ? "revenue" : "",
  row.operating_income_usd_m === null ? "operating income" : "",
].filter(Boolean);

const reviewNote =
  missingMetrics.length > 0
    ? `${row.review_note} Missing ${missingMetrics.join(" and ")}; legacy table displays 0.`
    : row.review_note;
```

Use `reviewNote` in the returned row.

- [ ] **Step 3: Add regression test**

Add to `src/lib/step2-schema.test.mts`:

```ts
test("marks legacy zero display when structured metrics are missing", () => {
  const payload = structuredClone(validPayload);
  payload.rows[0].revenue_usd_m = null;
  payload.rows[0].operating_income_usd_m = 123;

  const parsed = Step2StructuredSchema.parse(payload);
  const rows = projectStep2StructuredToRows(parsed);

  assert.equal(rows[0].revenue, 0);
  assert.match(rows[0].reviewNote ?? "", /Missing revenue/);
});
```

- [ ] **Step 4: Run tests**

Run:

```bash
node --test src/lib/step2-schema.test.mts
npm test
```

Expected: PASS.

---

### Task 7: Final Verification

**Files:**
- No new files.

- [ ] **Step 1: Run full test suite**

Run:

```bash
npm test
```

Expected: PASS.

- [ ] **Step 2: Run TypeScript**

Run:

```bash
node node_modules/typescript/bin/tsc --noEmit
```

Expected: PASS.

- [ ] **Step 3: Run production build**

Run:

```bash
node node_modules/next/dist/bin/next build --webpack
```

Expected: PASS.

- [ ] **Step 4: Run local dev server for manual demo**

Run:

```bash
node node_modules/next/dist/bin/next dev --webpack -H 127.0.0.1 -p 3001
```

Expected: app opens at `http://127.0.0.1:3001`.

- [ ] **Step 5: Manual smoke test**

In the browser:

1. Complete Step 1 with an approved architecture.
2. Navigate to Step 2.
3. Enter a target fiscal year.
4. Upload one CSV/XLSX/TXT file or paste text notes.
5. Click `Extract & Map Data`.
6. Confirm the staging table appears with review summary.
7. Edit at least one revenue value.
8. Click `Confirm & Append to Master History`.
9. Verify the master history table groups rows by segment.

Expected: no runtime error, rows remain editable, and master history persists in app state.

---

## Handoff Notes for the Next Thread

Start by reading:

```bash
sed -n '1,260p' docs/superpowers/plans/2026-04-24-step2-v55-structured-history.md
sed -n '1,280p' src/components/steps/Step2History.tsx
sed -n '1,380p' src/app/api/extract-history/route.ts
sed -n '250,310p' src/types/cfp.ts
```

Use TDD. Do not start by manually refactoring the whole Step 2 UI. Keep the MVP path intact: upload or paste data, extract, stage, edit, confirm to master.

The most important product outcome is not a prettier table. It is this invariant:

```txt
Every confirmed historical row must be traceable to Step 1 canonical architecture and to an uploaded or pasted source.
```

