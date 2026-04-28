# ════════════════════════════════════════
# STEP 3 — Competitive Landscape
# ════════════════════════════════════════

# ──────────────────────────
# 🔴 STEP 3A GENERATION — Competitor Pairing (default)
# ──────────────────────────

"""
# Step 3A: Competitor Pairing

## Input
[PASTE: Step 1 machine_artifact]

## Objective
Identify the most relevant competitor for each category that will materially influence forecast assumptions.

## v5.5 Materiality Rule
Do NOT attempt exhaustive competitor mapping for every minor product.
Prioritize only categories that are:
- forecast-relevant
- revenue-relevant
- strategically differentiated enough to affect Step 5 assumptions

## Evidence Requirement
Pairing must be based on at least one:
- market share source
- analyst report
- peer SEC filing / investor presentation

## Required Output
```json
{
  "machine_artifact": {
    "pairings": [
      {
        "category": "",
        "primary_competitor": "",
        "competitive_status": "Leader / Challenger / Unclear",
        "basis_claim_id": "",
        "source_tier": 1,
        "source_access": "DIRECT / SECONDARY / N/A",
        "confidence": "HIGH / MEDIUM / LOW",
        "human_review_required": true
      }
    ],
    "workflow_status": "READY / NEEDS_REVIEW / BLOCKED",
    "next_action": "PROCEED_STEP4 / HUMAN_REVIEW_COMPETITOR_PAIRING / REGENERATE"
  }
}
```

## Reviewer Summary
For each material category:
- chosen competitor
- confidence
- whether pairing is forecast-relevant

## UI Handoff
Show only:
- category
- primary competitor
- confidence
- if user confirmation is needed

## Escalation Rule
If confidence = LOW or cross-model conflict exists:
→ NEEDS_REVIEW
→ HUMAN_REVIEW_COMPETITOR_PAIRING
"""


# ──────────────────────────
# 🔴 STEP 3B GENERATION — Porter's Forces (Full Mode / material categories only)
# ──────────────────────────

"""
# Step 3B: Porter's Five Forces

## Input
[PASTE: validated Step 3A pairings]

## v5.5 Scope Compression
Run only for categories that are both:
- material to forecast
- supported by enough external evidence

If a category lacks quantitative anchors, output LOW_EVIDENCE_COMPETITION and stop expanding it.

## Required Output
```json
{
  "machine_artifact": {
    "forces": [],
    "low_evidence_categories": [],
    "workflow_status": "READY / NEEDS_REVIEW / BLOCKED",
    "next_action": "PROCEED_STEP4 / REVIEW_LOW_EVIDENCE_COMPETITION / REGENERATE"
  }
}
```
"""


# ──────────────────────────
# 🟢 CHECKPOINT A — Competitor Existence
# ──────────────────────────

"""
Reply:
category=[...]
competitor=[...]
same_category=YES / NO / UNSURE
failure_reason=[CATEGORY_MISMATCH / TOO_BROAD / N/A]
"""


# ──────────────────────────
# 🟢 CHECKPOINT B — Evidence Has Data
# ──────────────────────────

"""
For each force row:
anchor_status=HAS_NUMBER / NO_NUMBER
failure_reason=[QUALITATIVE_ONLY / SOURCE_MISSING / N/A]
"""


# ──────────────────────────
# 🟡 STEP 3 CLAIM-SUPPORT-FIT
# ──────────────────────────

"""
For each claim:
snippet_supports_claim=FULLY / PARTIALLY / NOT_AT_ALL
source_verifiable=YES / UNVERIFIABLE
tier_check=CORRECT / WRONG_TIER
access_check=CORRECT / WRONG_ACCESS
evidence_check=CORRECT / OVERLABELED
recommended_action=KEEP / DOWNGRADE / HUMAN_REVIEW / REGENERATE
"""


# ──────────────────────────
# 🔵 STEP 3 CROSS-MODEL
# ──────────────────────────

"""
Compare only material pairings.
If conflict remains on a material category:
- mark that category human_review_required=true
- do not auto-merge
"""


# ──────────────────────────
# ⚫ STEP 3 GATE
# ──────────────────────────

"""
HARD STOP:
- competitor does not actually operate in same category
- snippet mismatch on a material pairing claim

MUST FIX:
- wrong source tier / provenance
- unresolved overlabeling

AUTO-PAUSE FOR HUMAN REVIEW:
- LOW confidence on a material pairing
- cross-model conflict on a material pairing

PROCEED when:
- Step 4 can safely consume competitor identity and rivalry signal
"""
