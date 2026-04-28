# ════════════════════════════════════════
# STEP 1 — Business Architecture
# ════════════════════════════════════════

# ──────────────────────────
# 🔴 STEP 1 GENERATION
# Model: Advanced model
# ──────────────────────────

"""
# Step 1: Business Architecture Breakdown
# Company: [INSERT TICKER]

## Objective
Build the authoritative business structure that all later steps must use.

## Sources
1. Most recent 10-K
2. Most recent 10-Q or earnings release only for updates / breakouts

## Hard Rules
- Base segments strictly on reported structure
- No valuation commentary
- No revenue estimates
- If uncertain, mark as excluded instead of guessing

## Output Phases

### Phase 1 — Structured Claims
For each segment / category / product family that may feed later steps:

CLAIM: [S1-001]
TEXT: [...]
SOURCE_SNIPPET: [...]
SOURCE_LOCATION: [...]
EVIDENCE_LEVEL: [DISCLOSED / STRONG_INFERENCE / WEAK_INFERENCE]

### Phase 2 — Architecture Assembly
Output:
```json
{
  "machine_artifact": {
    "architecture": [
      {
        "segment": "",
        "segment_claim_id": "",
        "offerings": [
          {
            "category": "",
            "products": [],
            "claim_id": "",
            "customer_type": ""
          }
        ]
      }
    ],
    "canonical_names": {
      "segments": [],
      "products_with_data": []
    },
    "excluded_items": [],
    "workflow_status": "READY / NEEDS_REVIEW / BLOCKED",
    "next_action": "PROCEED_STEP2 / HUMAN_REVIEW_SEGMENT_MAPPING / REGENERATE"
  }
}
```

### Phase 3 — Reviewer Summary
Output a short reviewer block:
- reported segment count
- output segment count
- any renamed / restated / pending breakout items
- whether human review is needed

### Phase 4 — UI Handoff
Output a concise user-facing summary:
- what business structure was identified
- confidence
- any items requiring manual confirmation

## Workflow Escalation Rule
If either condition is true:
1. output segment count != 10-K reportable segment count
2. a key product cannot be mapped to a segment with at least STRONG_INFERENCE
→ workflow_status = NEEDS_REVIEW
→ next_action = HUMAN_REVIEW_SEGMENT_MAPPING
"""


# ──────────────────────────
# 🟢 STEP 1 CHECKPOINT A — Segment Count
# ──────────────────────────

"""
You are a counter. Reply with only:
count=[number]
reason=[one short phrase]
"""


# ──────────────────────────
# 🟢 STEP 1 CHECKPOINT B — Segment Name Match
# ──────────────────────────

"""
For each segment name from the generated output, reply:
1. FOUND / NOT_FOUND
   nearest_phrase=[short phrase or N/A]
   failure_reason=[EXACT_MISS / ALTERNATIVE_NAME / REAL_CONFLICT / N/A]
"""


# ──────────────────────────
# 🟢 STEP 1 CHECKPOINT C — Snippet Verification
# ──────────────────────────

"""
For each sampled claim, reply:
1. FOUND_VERBATIM / FOUND_PARAPHRASED / NOT_FOUND
   failure_reason=[QUOTE_MISMATCH / WRONG_PAGE / OVERASSEMBLED / N/A]
"""


# ──────────────────────────
# 🟡 STEP 1 CLAIM-SUPPORT-FIT AUDIT
# ──────────────────────────

"""
Audit each claim for:
1. supported_portion
2. unsupported_portion
3. evidence_level_check
4. materiality_to_downstream = HIGH / MEDIUM / LOW

Output:
CLAIM: [id]
fit: FULL_SUPPORT / PARTIAL_SUPPORT / SNIPPET_MISMATCH
unsupported_type: NONE / CATEGORY_ASSIGNMENT / PRODUCT_LIST_ASSEMBLED / CUSTOMER_TYPE / SCOPE
recommended_action: KEEP / DOWNGRADE / EXCLUDE / REQUIRE_REVIEW
"""


# ──────────────────────────
# ⚫ STEP 1 GATE
# ──────────────────────────

"""
HARD STOP:
- segment count mismatch
- any SNIPPET_MISMATCH on a segment-level claim

MUST FIX:
- over-labeled evidence
- unsupported customer type
- product list assembled without clear basis

PROCEED when:
- segments are structurally clean
- canonical name registry is complete
- workflow_status != BLOCKED
"""
