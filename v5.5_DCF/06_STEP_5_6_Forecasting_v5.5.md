# ════════════════════════════════════════
# STEP 5/6 — Forecasting
# ════════════════════════════════════════

# ──────────────────────────
# 🔴 STEP 5/6 GENERATION (default = Light-first, segment-first)
# ──────────────────────────

"""
# Step 5/6: Forecasting

## Input
- Step 1 machine_artifact
- Step 2 machine_artifact
- Step 3 machine_artifact
- Step 4 machine_artifact
- Step 4.5 machine_artifact

## v5.5 Default Mode
Default to segment-level annual forecast.
Upgrade to quarterly or product-level only if BOTH are true:
1. disclosure supports it
2. business/user explicitly needs it

## Why
This is the main execution-cost control in v5.5.
We optimize first for:
- stable output
- low hallucination
- workflow usability
- fast refreshability

## Required Machine Artifact
```json
{
  "machine_artifact": {
    "forecast_mode": "SEGMENT_ANNUAL / SEGMENT_QUARTERLY / PRODUCT_QUARTERLY",
    "assumptions": [
      {
        "id": "A001",
        "statement": "",
        "basis_claim_ids": [],
        "driver_quality": "DISCLOSED / STRONG / WEAK / ESTIMATED_BASE",
        "driver_eligibility_source": "",
        "arithmetic_trace": "",
        "management_override_required": false
      }
    ],
    "forecast_table": [],
    "weak_inference_sensitivity": [],
    "confidence_summary": {},
    "workflow_status": "READY / NEEDS_REVIEW / BLOCKED",
    "next_action": "PROCEED_STEP7 / HUMAN_REVIEW_MAJOR_ASSUMPTION / REGENERATE"
  }
}
```

## Mode Selection Rules

### Rule 1 — Segment-first default
Use SEGMENT_ANNUAL unless there is a positive reason to go deeper.

### Rule 2 — Product-level upgrade only when:
- majority of forecast-relevant entities have separate disclosure
- Step 2 inventory supports product granularity
- no major name / mapping conflicts remain

### Rule 3 — Weak evidence containment
Any weak-inference driver must be:
- tagged
- isolated in sensitivity
- visible in confidence summary

### Rule 4 — Arithmetic Trace
Every assumption that directly drives a forecast number must include arithmetic_trace.

### Rule 5 — Guidance / Capital discipline
If assumption deviates from management guidance or capital feasibility:
- tag it
- elevate reviewer visibility
- do not hide it in prose

## Reviewer Summary
Show only:
- forecast mode selected and why
- top 5 assumptions
- weak-inference exposure
- major deviations from historical trend or guidance

## UI Handoff
Show only:
- base case growth path
- top drivers
- uncertainty level
- whether human override was used

## Human Review Trigger
Any of the following:
- major segment growth materially above history without strong basis
- assumption depends on weak evidence and changes FY5 materially
- product-level mode chosen despite weak disclosure
→ NEEDS_REVIEW
"""


# ──────────────────────────
# 🟢 CHECKPOINT A — Baseline and Trace
# ──────────────────────────

"""
For each sampled segment:
baseline_check=MATCH / OUTSIDE_RANGE
growth_check=MATCH / MISMATCH
trace_check=MATCH / TRACE_MISMATCH
failure_reason=[BAD_BASELINE / BAD_GROWTH_MATH / BAD_TRACE / N/A]
"""


# ──────────────────────────
# 🟢 CHECKPOINT B — Summation
# ──────────────────────────

"""
sum_check=MATCH / MISMATCH
failure_reason=[ROLLUP_ERROR / MODE_MISALIGNMENT / N/A]
"""


# ──────────────────────────
# 🟢 CHECKPOINT C — Growth Sanity
# ──────────────────────────

"""
entity=[...]
status=OK / FLAG
failure_reason=[AGGRESSIVE_GROWTH / AGGRESSIVE_DECLINE / TAM_CONFLICT / N/A]
"""


# ──────────────────────────
# 🟢 CHECKPOINT D — Driver Eligibility
# ──────────────────────────

"""
assumption=[id]
eligibility_check=CORRECT / TOO_PERMISSIVE
failure_reason=[WEAK_DRIVER_UNTAGGED / INTEGRATION_CAP_BROKEN / UNSUPPORTED_DRIVER / N/A]
"""


# ──────────────────────────
# 🟡 STEP 5/6 AUDIT
# ──────────────────────────

"""
Audit only material assumptions and material segments.

For each sampled assumption:
claim_link_check=VALID / MISSING
trace_check=VALID / INVALID
driver_quality_check=CORRECT / OVERSTATED
consumption_check=DOWNSTREAM_SAFE / NOT_SAFE
recommended_action=KEEP / FIX / HUMAN_REVIEW
"""


# ──────────────────────────
# ⚫ STEP 5/6 GATE
# ──────────────────────────

"""
HARD STOP:
- arithmetic trace mismatch on a material assumption
- unsupported entity receives forecast dollars
- unsupported / disallowed synergy used as a driver

MUST FIX:
- weak driver not tagged
- guidance deviation not surfaced
- mode too granular for disclosure quality

AUTO-PAUSE:
- major assumption override required

PROCEED when:
- Step 7 can consume forecast cleanly
- final audit can independently recalculate weak-inference exposure
"""
