# ════════════════════════════════════════
# STEP 2 — Historical Financial Data
# ════════════════════════════════════════

# ──────────────────────────
# 🔴 STEP 2 GENERATION
# Model: Advanced model
# ──────────────────────────

"""
# Step 2: Historical Financial Data Extraction
# Company: [INSERT TICKER]

## Input
[PASTE: validated Step 1 machine_artifact]

## Preferred Input Format
Use pre-extracted tables / spreadsheets / structured text whenever available.
Do NOT require raw full-PDF rereading if curated tables already exist.

## Objective
Create a disclosure-bounded historical data artifact that later steps can safely consume.

## Disclosure Rules
| Status | Treatment |
|:---|:---|
| Quarterly dollar data | extract |
| Annual only | annual only |
| Growth pct only | growth only, no dollar estimate |
| Qualitative only | retain wording, no numeric conversion |
| Not separately reported | no forecastable numeric row |

## Required Output
```json
{
  "machine_artifact": {
    "disclosure_inventory": {},
    "history_rows": [],
    "rollup_checks": [],
    "anomaly_flags": [],
    "source_manifest": [],
    "workflow_status": "READY / NEEDS_REVIEW / BLOCKED",
    "next_action": "PROCEED_STEP3 / HUMAN_REVIEW_DATA_CONFLICT / REGENERATE"
  }
}
```

Each history row must include:
- fiscal_year
- quarter
- segment
- product_or_entity
- metric_type
- value
- claim_id
- evidence_level
- disclosure_status
- source_location

## Reviewer Summary
Output:
- how many entities have quarterly dollars
- how many are annual only / growth only / not separately reported
- whether any entity was wrongly given unsupported numbers
- whether rollup passed

## UI Handoff
Output a short explanation:
- data coverage quality
- whether forecast can safely go product-level
- whether segment-only fallback is likely

## Workflow Escalation Rule
If any entity appears in both:
- numeric rows
- not_separately_reported list
→ BLOCKED

If rollup gap >0.5% but sources are partially restated / mixed:
→ NEEDS_REVIEW
"""


# ──────────────────────────
# 🟢 CHECKPOINT A — Rollup Math
# ──────────────────────────

"""
Reply:
year=[FY]
sum=[number]
reported=[number]
gap_pct=[number]
status=MATCH / MISMATCH
"""


# ──────────────────────────
# 🟢 CHECKPOINT B — Spot Number Verification
# ──────────────────────────

"""
For each sampled number:
claimed=[X]
source=[Y]
status=EXACT / CLOSE / MISMATCH
failure_reason=[TABLE_READ_ERROR / UNIT_ERROR / RESTATEMENT_MIX / N/A]
"""


# ──────────────────────────
# 🟢 CHECKPOINT C — Zero Fabrication
# ──────────────────────────

"""
Question 1: overlap_with_not_reported = YES / NO
Question 2: overlap_with_growth_only = YES / NO
overall = CLEAN / FABRICATION_DETECTED
"""


# ──────────────────────────
# 🟢 CHECKPOINT D — Y/Y Arithmetic
# ──────────────────────────

"""
For each sample:
calculated=[x]%
claimed=[y]%
status=MATCH / MISMATCH
"""


# ──────────────────────────
# 🟡 STEP 2 CLAIM-SUPPORT-FIT
# ──────────────────────────

"""
For each sampled claim:
number_match=EXACT / CLOSE / MISMATCH
level_check=CORRECT / OVERLABELED
calculation_shown=YES / NO / N/A
recommended_action=KEEP / FIX / REVIEW
"""


# ──────────────────────────
# ⚫ STEP 2 GATE
# ──────────────────────────

"""
HARD STOP:
- fabrication detected
- rollup mismatch with no valid restatement explanation

MUST FIX:
- mislabeled derived values
- missing source manifest entries

PROCEED when:
- disclosure boundary is clean
- history_rows can be safely consumed by Step 3 and Step 5
"""
