# Step 1 v5.5 Structured Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Step 1's schema-drifting markdown/JSON parsing with a single v5.5-aligned structured output contract that supports different filing disclosure styles, keeps source traceability, and feeds the existing app through a compatibility layer.

**Architecture:** Step 1 will produce one canonical `Step1StructuredResult` containing `reported_view`, `analysis_view`, `claims`, `excluded_items`, `canonical_name_registry`, and review metadata. The API route will validate this schema after the LLM call, derive the legacy `architectureJson` projection from `analysis_view`, and the review UI will render both reported and analysis views from the validated result.

**Tech Stack:** Next.js App Router API routes, TypeScript, Zod, Anthropic SDK, Gemini structured output, Node test runner.

---

### Task 1: Define the Step 1 v5.5 schema and fixtures

**Files:**
- Create: `dcf-cfp-module/src/lib/step1-schema.ts`
- Create: `dcf-cfp-module/src/lib/step1-schema.test.mts`
- Use fixture: `dcf-cfp-module/test/fixtures/step1/apple/step1_output_v1/apple_inc_-step1-04-23-2026.txt`

- [ ] **Step 1: Write the failing tests**

```ts
import test from "node:test";
import assert from "node:assert/strict";
import {
  STEP1_RESPONSE_SCHEMA,
  Step1StructuredSchema,
  projectStructuredStep1ToArchitecture,
} from "./step1-schema.ts";

test("parses a valid step 1 structured payload with reported and analysis views", () => {
  const payload = {
    schema_version: "v5.5",
    company_name: "Apple Inc.",
    reported_view: {
      view_type: "revenue_category",
      nodes: [
        {
          id: "reported:products",
          label: "Products",
          raw_name_variants: ["Products"],
          children: [
            {
              id: "reported:products:iphone",
              label: "iPhone",
              raw_name_variants: ["iPhone"],
              products: ["iPhone 16", "iPhone 16 Pro"],
              customer_type: "Consumer",
              claim_id: "S1-001",
              evidence_level: "DISCLOSED",
            },
          ],
          claim_id: "S1-000",
          evidence_level: "DISCLOSED",
        },
      ],
    },
    analysis_view: {
      segments: [
        {
          id: "segment:products",
          canonical_name: "Products",
          raw_name_variants: ["Products"],
          mapped_from_reported_node_ids: ["reported:products"],
          claim_id: "S1-010",
          evidence_level: "DISCLOSED",
          offerings: [
            {
              id: "offering:iphone",
              canonical_name: "iPhone",
              category: "Hardware",
              raw_name_variants: ["iPhone"],
              mapped_from_reported_node_ids: ["reported:products:iphone"],
              products: ["iPhone 16", "iPhone 16 Pro"],
              customer_type: "Consumer",
              claim_id: "S1-011",
              evidence_level: "DISCLOSED",
            },
          ],
        },
      ],
      excluded_items: [],
      canonical_name_registry: {
        Products: "Products",
        iPhone: "iPhone",
      },
    },
    claims: [
      {
        claim_id: "S1-000",
        text: "Apple reports Products as a revenue category.",
        source_snippet: "Products net sales ...",
        source_location: "Form 10-K, Net Sales by Reportable Segment",
        evidence_level: "DISCLOSED",
      },
    ],
    sources: [
      {
        document: "Apple Inc. Form 10-K",
        section: "Net sales by category",
      },
    ],
  };

  const parsed = Step1StructuredSchema.parse(payload);
  const legacy = projectStructuredStep1ToArchitecture(parsed);

  assert.equal(parsed.reported_view.view_type, "revenue_category");
  assert.equal(legacy.architecture[0].segment, "Products");
  assert.deepEqual(legacy.architecture[0].businessLines.map((line) => line.name), ["iPhone"]);
});

test("rejects a segment that is missing mapping provenance", () => {
  const payload = {
    schema_version: "v5.5",
    company_name: "Example Corp",
    reported_view: { view_type: "operating_segment", nodes: [] },
    analysis_view: {
      segments: [
        {
          id: "segment:bad",
          canonical_name: "Bad Segment",
          raw_name_variants: ["Bad Segment"],
          mapped_from_reported_node_ids: [],
          claim_id: "S1-001",
          evidence_level: "DISCLOSED",
          offerings: [],
        },
      ],
      excluded_items: [],
      canonical_name_registry: { "Bad Segment": "Bad Segment" },
    },
    claims: [],
    sources: [],
  };

  assert.throws(() => Step1StructuredSchema.parse(payload));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && node --test src/lib/step1-schema.test.mts`  
Expected: FAIL with module-not-found or missing export errors for `step1-schema.ts`

- [ ] **Step 3: Write minimal implementation**

```ts
import { z } from "zod";
import type { BusinessArchitecture } from "@/types/cfp";

const EvidenceLevelSchema = z.enum([
  "DISCLOSED",
  "STRONG_INFERENCE",
  "WEAK_INFERENCE",
  "UNSUPPORTED",
]);

const SourceSchema = z.object({
  document: z.string().min(1),
  section: z.string().min(1),
  page: z.string().optional(),
});

const ClaimSchema = z.object({
  claim_id: z.string().min(1),
  text: z.string().min(1),
  source_snippet: z.string().nullable(),
  source_location: z.string().nullable(),
  evidence_level: EvidenceLevelSchema,
  basis_claim_ids: z.array(z.string().min(1)).optional(),
});

const ReportedNodeSchema: z.ZodType<any> = z.lazy(() =>
  z.object({
    id: z.string().min(1),
    label: z.string().min(1),
    raw_name_variants: z.array(z.string().min(1)).default([]),
    products: z.array(z.string().min(1)).default([]),
    customer_type: z.string().optional(),
    claim_id: z.string().min(1),
    evidence_level: EvidenceLevelSchema,
    children: z.array(ReportedNodeSchema).default([]),
  }),
);

const AnalysisOfferingSchema = z.object({
  id: z.string().min(1),
  canonical_name: z.string().min(1),
  category: z.string().min(1),
  raw_name_variants: z.array(z.string().min(1)).default([]),
  mapped_from_reported_node_ids: z.array(z.string().min(1)).min(1),
  products: z.array(z.string().min(1)).default([]),
  customer_type: z.string().min(1),
  claim_id: z.string().min(1),
  evidence_level: EvidenceLevelSchema,
});

const AnalysisSegmentSchema = z.object({
  id: z.string().min(1),
  canonical_name: z.string().min(1),
  raw_name_variants: z.array(z.string().min(1)).default([]),
  mapped_from_reported_node_ids: z.array(z.string().min(1)).min(1),
  claim_id: z.string().min(1),
  evidence_level: EvidenceLevelSchema,
  offerings: z.array(AnalysisOfferingSchema).default([]),
});

const ExcludedItemSchema = z.object({
  raw_name: z.string().min(1),
  reason: z.string().min(1),
  evidence_level: EvidenceLevelSchema,
  claim_id: z.string().min(1),
});

export const Step1StructuredSchema = z.object({
  schema_version: z.literal("v5.5"),
  company_name: z.string().min(1),
  reported_view: z.object({
    view_type: z.enum(["operating_segment", "revenue_category", "geography", "mixed"]),
    nodes: z.array(ReportedNodeSchema),
  }),
  analysis_view: z.object({
    segments: z.array(AnalysisSegmentSchema),
    excluded_items: z.array(ExcludedItemSchema),
    canonical_name_registry: z.record(z.string().min(1), z.string().min(1)),
  }),
  claims: z.array(ClaimSchema),
  sources: z.array(SourceSchema),
});

export const STEP1_RESPONSE_SCHEMA = {
  type: "object",
  required: ["schema_version", "company_name", "reported_view", "analysis_view", "claims", "sources"],
};

export type Step1StructuredResult = z.infer<typeof Step1StructuredSchema>;

export function projectStructuredStep1ToArchitecture(
  result: Step1StructuredResult,
): BusinessArchitecture {
  return {
    architecture: result.analysis_view.segments.map((segment) => ({
      segment: segment.canonical_name,
      businessLines: segment.offerings.map((offering) => ({
        name: offering.canonical_name,
        products: offering.products,
        customerType: offering.customer_type,
        dataSource: offering.claim_id,
      })),
    })),
    sources: result.sources,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && node --test src/lib/step1-schema.test.mts`  
Expected: PASS with both tests green

- [ ] **Step 5: Commit**

```bash
git add src/lib/step1-schema.ts src/lib/step1-schema.test.mts
git commit -m "feat: add step 1 structured schema"
```

### Task 2: Add structured-output support to the shared LLM service

**Files:**
- Modify: `dcf-cfp-module/src/lib/llm-service.ts`
- Test: `dcf-cfp-module/src/lib/step1-schema.test.mts`

- [ ] **Step 1: Write the failing test**

```ts
test("extracts structured JSON from a Claude tool response", () => {
  const message = {
    content: [
      {
        type: "tool_use",
        name: "emit_step1_payload",
        input: {
          schema_version: "v5.5",
          company_name: "Apple Inc.",
          reported_view: { view_type: "revenue_category", nodes: [] },
          analysis_view: { segments: [], excluded_items: [], canonical_name_registry: {} },
          claims: [],
          sources: [],
        },
      },
    ],
  };

  const text = extractStructuredToolPayload(message as any, "emit_step1_payload");
  assert.match(text, /"schema_version":"v5\.5"/);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && node --test src/lib/step1-schema.test.mts`  
Expected: FAIL because `extractStructuredToolPayload` does not exist

- [ ] **Step 3: Write minimal implementation**

```ts
export interface StructuredOutputOptions {
  toolName: string;
  toolDescription: string;
  inputSchema: Record<string, unknown>;
}

export interface CallLLMOptions {
  // existing fields...
  responseSchema?: Record<string, any>;
  structuredOutput?: StructuredOutputOptions;
}

function extractStructuredToolPayload(message: Anthropic.Message, toolName: string): string {
  const toolBlock = message.content.find(
    (block): block is Anthropic.ToolUseBlock =>
      block.type === "tool_use" && block.name === toolName,
  );
  if (!toolBlock) {
    throw new Error(`Claude response did not include required tool payload: ${toolName}`);
  }
  return JSON.stringify(toolBlock.input);
}

async function callClaude(
  apiKey: string,
  prompt: string,
  systemPrompt: string | undefined,
  maxTokens: number,
  structuredOutput?: StructuredOutputOptions,
): Promise<CallLLMResult> {
  const anthropic = new Anthropic({ apiKey });

  const message = await anthropic.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(structuredOutput
      ? {
          tools: [
            {
              name: structuredOutput.toolName,
              description: structuredOutput.toolDescription,
              input_schema: structuredOutput.inputSchema,
            },
          ],
          tool_choice: { type: "tool", name: structuredOutput.toolName },
        }
      : {}),
    messages: [{ role: "user", content: prompt }],
  });

  if (structuredOutput) {
    return { text: extractStructuredToolPayload(message, structuredOutput.toolName) };
  }

  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");

  return { text };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && node --test src/lib/step1-schema.test.mts`  
Expected: PASS with structured-output extraction test green

- [ ] **Step 5: Commit**

```bash
git add src/lib/llm-service.ts src/lib/step1-schema.test.mts
git commit -m "feat: support structured output in llm service"
```

### Task 3: Replace Step 1 route parsing with a validated v5.5 pipeline

**Files:**
- Modify: `dcf-cfp-module/src/app/api/analyze-company/route.ts`
- Modify: `dcf-cfp-module/src/types/cfp.ts`
- Test: `dcf-cfp-module/src/lib/step1-schema.test.mts`

- [ ] **Step 1: Write the failing tests**

```ts
test("builds a step 1 review state from a structured result projection", () => {
  const structured = Step1StructuredSchema.parse({
    schema_version: "v5.5",
    company_name: "Apple Inc.",
    reported_view: { view_type: "revenue_category", nodes: [] },
    analysis_view: {
      segments: [
        {
          id: "segment:products",
          canonical_name: "Products",
          raw_name_variants: ["Products"],
          mapped_from_reported_node_ids: ["reported:products"],
          claim_id: "S1-010",
          evidence_level: "DISCLOSED",
          offerings: [
            {
              id: "offering:iphone",
              canonical_name: "iPhone",
              category: "Hardware",
              raw_name_variants: ["iPhone"],
              mapped_from_reported_node_ids: ["reported:products:iphone"],
              products: ["iPhone 16"],
              customer_type: "Consumer",
              claim_id: "S1-011",
              evidence_level: "DISCLOSED",
            },
          ],
        },
      ],
      excluded_items: [],
      canonical_name_registry: { Products: "Products", iPhone: "iPhone" },
    },
    claims: [],
    sources: [{ document: "Apple Inc. Form 10-K", section: "Net sales by category" }],
  });

  const legacy = projectStructuredStep1ToArchitecture(structured);
  const review = buildStep1ReviewState(legacy);

  assert.equal(review.segments.length, 1);
  assert.equal(review.businessLines.length, 1);
  assert.equal(review.summary.warnings.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && npm test`  
Expected: FAIL because the new structured route contract is not yet wired through

- [ ] **Step 3: Write minimal implementation**

```ts
const STEP1_SYSTEM_PROMPT = [
  "You are building a filing-grounded business architecture artifact for DCF analysis.",
  "Return only the required structured payload.",
  "Be conservative: if an item is not clearly disclosed or strongly supported, exclude it from analysis_view and place it in excluded_items instead.",
  "reported_view must preserve the company's original disclosure axis.",
  "analysis_view must contain only the stable DCF-ready mapping used downstream.",
].join(" ");

const result = await callLLM({
  provider: llmProvider,
  apiKey,
  prompt,
  systemPrompt: STEP1_SYSTEM_PROMPT,
  maxTokens: 8192,
  responseSchema: llmProvider === "gemini" ? STEP1_RESPONSE_SCHEMA : undefined,
  structuredOutput:
    llmProvider === "claude"
      ? {
          toolName: "emit_step1_payload",
          toolDescription: "Emit the validated Step 1 v5.5 payload.",
          inputSchema: STEP1_RESPONSE_SCHEMA,
        }
      : undefined,
});

const structuredResult = Step1StructuredSchema.parse(JSON.parse(result.text));
const architectureJson = projectStructuredStep1ToArchitecture(structuredResult);
const step1Review = buildStep1ReviewState(architectureJson);

return NextResponse.json({
  rawMarkdown: JSON.stringify(structuredResult, null, 2),
  architectureJson,
  step1Review,
  step1Structured: structuredResult,
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && npm test`  
Expected: PASS with Step 1 review tests green

- [ ] **Step 5: Commit**

```bash
git add src/app/api/analyze-company/route.ts src/types/cfp.ts src/lib/step1-schema.test.mts
git commit -m "feat: validate step 1 through v5.5 structured contract"
```

### Task 4: Upgrade Step 1 review UI to show reported and analysis views together

**Files:**
- Modify: `dcf-cfp-module/src/components/steps/Step1Profile.tsx`
- Modify: `dcf-cfp-module/src/context/CFPContext.tsx`
- Modify: `dcf-cfp-module/src/types/cfp.ts`
- Test: manual smoke via `http://localhost:3000`

- [ ] **Step 1: Write the failing test**

```ts
test("stores the structured step 1 payload in context", () => {
  const profile = {
    rawAnalysisMarkdown: "{}",
    architectureJson: { architecture: [], sources: [] },
    step1Review: null,
    step1Structured: {
      schema_version: "v5.5",
      company_name: "Apple Inc.",
      reported_view: { view_type: "revenue_category", nodes: [] },
      analysis_view: { segments: [], excluded_items: [], canonical_name_registry: {} },
      claims: [],
      sources: [],
    },
  };

  assert.equal(profile.step1Structured.reported_view.view_type, "revenue_category");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && node --test src/lib/step1-schema.test.mts`  
Expected: FAIL because `step1Structured` is not part of the current shared types/state

- [ ] **Step 3: Write minimal implementation**

```tsx
{companyProfile.step1Structured ? (
  <section className="space-y-6">
    <div className="grid gap-4 lg:grid-cols-2">
      <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-lg font-semibold text-white">Reported View</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Disclosure axis: {companyProfile.step1Structured.reported_view.view_type}
        </p>
        {/* render reported nodes recursively */}
      </article>
      <article className="rounded-2xl border border-white/10 bg-white/5 p-5">
        <h3 className="text-lg font-semibold text-white">Analysis View</h3>
        <p className="mt-1 text-sm text-zinc-400">
          Downstream DCF mapping used by Step 2 and later steps.
        </p>
        {/* render analysis segments + offerings */}
      </article>
    </div>
  </section>
) : null}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && npm test`  
Expected: PASS and the UI can render with no type errors

- [ ] **Step 5: Commit**

```bash
git add src/components/steps/Step1Profile.tsx src/context/CFPContext.tsx src/types/cfp.ts
git commit -m "feat: show reported and analysis views in step 1 review"
```

### Task 5: Verify end-to-end behavior for conservative, traceable Step 1 output

**Files:**
- Modify if needed: `dcf-cfp-module/src/lib/step1-review.ts`
- Verify fixture: `dcf-cfp-module/test/fixtures/step1/apple/apple-2024-10k.pdf`
- Verify fixture: `dcf-cfp-module/test/fixtures/step1/apple/apple-2025-q2-10q.pdf`

- [ ] **Step 1: Run focused automated verification**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && npm test`  
Expected: PASS with all Step 1 tests green

- [ ] **Step 2: Run typecheck**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && node node_modules/typescript/bin/tsc --noEmit`  
Expected: PASS with exit code 0

- [ ] **Step 3: Run production build**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && node node_modules/next/dist/bin/next build --webpack`  
Expected: PASS with a successful Next.js build

- [ ] **Step 4: Run dev server smoke test**

Run: `cd "/Users/lichenchangwen/Desktop/Checkit Analytics/DCF prompt coding/dcf-cfp-module" && node node_modules/next/dist/bin/next dev --webpack`  
Expected: app starts on `http://localhost:3000`, Step 1 renders both views, and a successful run shows traceable outputs instead of heuristic field fallbacks

- [ ] **Step 5: Commit**

```bash
git add src/lib/step1-review.ts
git commit -m "test: verify step 1 structured flow end to end"
```
