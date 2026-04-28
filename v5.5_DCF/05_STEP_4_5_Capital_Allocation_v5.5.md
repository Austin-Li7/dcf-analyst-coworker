# ════════════════════════════════════════
# STEP 4.5 — Capital Allocation
# ════════════════════════════════════════

# ──────────────────────────
# 🔴 STEP 4.5 GENERATION
# ──────────────────────────

"""
# Step 4.5: Capital Allocation and Investment Feasibility

## Input
- Step 1 machine_artifact
- Step 2 machine_artifact
- Step 4 machine_artifact

## Objective
Determine whether Step 5 growth assumptions are financially supportable.

## Required Output
```json
{
  "schema_version": "v5.5",
  "company_name": "",
  "review_summary": {
    "one_line": "",
    "highlights": [],
    "warnings": []
  },
  "sources": [],
  "claims": [],
  "synergy_registry": [],
  "capital_allocation": {
    "capital_metrics": [
      {
        "metric_id": "",
        "pillar": "",
        "objective": "",
        "capital_intensity": "Low / Medium / High / Unknown",
        "strategic_leverage": "",
        "synergy_link": "",
        "efficiency_score": 0,
        "claim_id": "",
        "source_ids": [],
        "review_note": ""
      }
    ],
    "feasibility_checkpoints": {
      "capex_runway": "",
      "scale_economics": "",
      "guidance_alignment": ""
    },
    "step5_revenue_ceiling": {
      "applies": false,
      "reason": "",
      "ceiling_revenue_usd_m": null
    },
    "asset_light_exemption": false,
    "workflow_status": "READY / NEEDS_REVIEW / BLOCKED",
    "next_action": "PROCEED_STEP5 / HUMAN_REVIEW_CAPITAL_CONSTRAINT / REGENERATE"
  },
  "validation_warnings": []
}
```

## Rules
- Use PP&E purchase line, not total investing cash flow
- Every source number must be claim-backed
- Every capital metric must cite `claim_id` and `source_ids`, and `synergy_link` must point to a Step 4 `synergy_id`
- If CapEx/Revenue < 8% for all five years:
  asset_light_exemption=true
  ceiling can be skipped

## Reviewer Summary
Show only:
- capital-intensive vs scale-achieving
- whether Step 5 ceiling applies
- whether current growth plan looks stretched

## UI Handoff
Show:
- "capital constraints normal / elevated"
- whether future revenue is likely constrained by reinvestment needs
"""


# ──────────────────────────
# 🟢 CHECKPOINT — CapEx Verify
# ──────────────────────────

"""
claimed_capex=[X]
source_capex=[Y]
status=MATCH / MISMATCH
failure_reason=[WRONG_LINE_ITEM / UNIT_ERROR / N/A]
"""


# ──────────────────────────
# ⚫ STEP 4.5 GATE
# ──────────────────────────

"""
HARD STOP:
- CapEx source verification fails

MUST FIX:
- ceiling math not shown
- guidance conflict unexplained

PROCEED when:
- Step 5 can consume either
  (a) valid ceiling
  or
  (b) valid asset-light exemption
"""
