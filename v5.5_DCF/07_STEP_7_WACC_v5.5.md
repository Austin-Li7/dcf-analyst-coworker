# ════════════════════════════════════════
# STEP 7 — WACC
# ════════════════════════════════════════

# ──────────────────────────
# 🔴 STEP 7 GENERATION
# ──────────────────────────

"""
# Step 7: WACC with Parameter Claims

## Objective
Convert discount rate inputs from opaque constants into a source-traceable parameter bundle.

## Required Output
```json
{
  "machine_artifact": {
    "parameter_claims": [],
    "wacc_inputs": {},
    "calculation_output": {},
    "staleness_flags": [],
    "workflow_status": "READY / NEEDS_REVIEW / BLOCKED",
    "next_action": "PROCEED_FINAL_AUDIT / HUMAN_REVIEW_WACC_INPUT / REGENERATE"
  }
}
```

## Required Parameter Claims
- risk_free_rate
- equity_risk_premium
- unlevered_beta
- market_cap
- total_debt
- interest_expense
- marginal_tax_rate

## v5.5 Compression Rule
Keep reviewer focus on only three things:
1. are all parameter claims present
2. are market cap / debt plausible vs filing
3. is the chosen beta mapping sensible

Peer reasonableness remains optional Full Mode support, not default user-facing output.

## Reviewer Summary
Show:
- WACC value
- stale inputs if any
- any mismatches against 10-K
- whether beta mapping needs review

## UI Handoff
Show:
- WACC base case
- sensitivity range
- confidence
"""


# ──────────────────────────
# 🟢 CHECKPOINT A — Range / Beta Reasonableness
# ──────────────────────────

"""
wacc_range_check=WITHIN_RANGE / OUTSIDE_RANGE
beta_mapping_check=PLAUSIBLE / QUESTIONABLE
"""


# ──────────────────────────
# 🟢 CHECKPOINT B — Input Cross-Verify
# ──────────────────────────

"""
debt_check=MATCH / MISMATCH
market_cap_check=MATCH / MISMATCH
failure_reason=[DATA_VENDOR_GAP / SHARE_COUNT_GAP / N/A]
"""


# ──────────────────────────
# 🟢 CHECKPOINT C — Parameter Claim Completeness
# ──────────────────────────

"""
claims_complete=YES / NO
missing_claims=[...]
missing_dates=[...]
"""


# ──────────────────────────
# 🟡 STEP 7 AUDIT
# ──────────────────────────

"""
For each required parameter:
source_present=YES / NO
date_present=YES / NO
fit=FULL / PARTIAL / MISMATCH
recommended_action=KEEP / FIX / HUMAN_REVIEW
"""


# ──────────────────────────
# ⚫ STEP 7 GATE
# ──────────────────────────

"""
HARD STOP:
- any required parameter claim missing
- debt or market cap mismatch unresolved
- critical constants stale >60 days

MUST FIX:
- questionable beta mapping
- stale constants 30-60 days
- missing date metadata

PROCEED when:
- final audit can consume a clean parameter bundle
"""
