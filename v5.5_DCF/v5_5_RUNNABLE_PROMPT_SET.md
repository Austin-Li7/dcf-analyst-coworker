# ══════════════════════════════════════════════════════════
# FINANCIAL VALUATION PIPELINE — v5.5 RUNNABLE PROMPT SET
# 最终目标：workflow-ready / eval-ready / reviewable / low-hallucination
# ══════════════════════════════════════════════════════════
#
# v5.5 相对 v5.4 的核心升级:
#   [P1] 默认执行策略改为 Light-first，而不是 Full-first
#   [P1] 每一步统一输出三层 artifact:
#        (a) machine_artifact 供后续步骤消费
#        (b) reviewer_summary 供人工快速审阅
#        (c) ui_handoff 供交互式 workflow 前端展示
#   [P1] Step 3 / 4 / 5 明确 materiality-first，仅保留真正影响 forecast 的字段
#   [P1] Step 5 默认 segment-first；仅在披露充分且用户需要时升级到 product-level
#   [P1] 明确 human-in-the-loop 节点：segment mapping / competitor pairing /
#        major forecast assumptions / audit exception resolution
#   [P1] 每一步补充 workflow_status 与 next_action，方便自动化编排器暂停/恢复
#   [P2] checkpoint 输出增加 failure_reason，降低 review 噪音
#   [P2] final audit 聚焦 blocking issue，不再把全部中间态暴露给最终用户
#
# 保留自 v5.4 的核心内核:
#   claims-first / canonical name registry / disclosure-bounded extraction
#   segment-only fallback / arithmetic trace / driver eligibility / pipeline audit
#
# ════════════════════════════════════════
# EXECUTION PHILOSOPHY (v5.5)
# ════════════════════════════════════════
#
# DEFAULT MODE = LIGHT-FIRST
#   1. 先跑 Light Mode，得到 screening-grade、可追溯结果
#   2. 仅在以下情况升级到 Full Mode:
#      - 目标公司是高优先级投资委员会案例
#      - Step 2 披露充分，可支持产品级建模
#      - Light Mode 中的关键结论仍存在未解决冲突
#
# WORKFLOW CONTRACT
#   每一步必须输出:
#   1. machine_artifact: 严格结构化，供下游步骤消费
#   2. reviewer_summary: 5-12 行，供人工快速判断 PASS / FIX / ESCALATE
#   3. ui_handoff: 最终用户可见的简短说明、置信度、待确认项
#   4. workflow_status: READY / NEEDS_REVIEW / BLOCKED
#   5. next_action: 下一步该自动继续、暂停人工、还是回滚重跑
#
# HUMAN-IN-THE-LOOP NODES
#   H1 Step 1: 若 segment mapping 或 canonical naming 存在冲突
#   H2 Step 3A: competitor pairing 存在 CONFLICT / LOW_CONFIDENCE
#   H3 Step 5: 重大 forecast assumption 偏离历史或 guidance
#   H4 Final Audit: 有 blocking issue 但系统无法自动修复
#
# EVAL CONTRACT
#   每一步都要保留最小可回归测试对象:
#   - input bundle id
#   - machine_artifact
#   - gate result
#   - failure_reason
#   - manually approved overrides
#
# 这允许后续使用 prompt regression / eval harness 做版本比较。
#
# ════════════════════════════════════════
# EXECUTION MODES
# ════════════════════════════════════════
#
# LIGHT MODE (默认):
#   - 目标: 2-3 小时内得到可审阅、可缓存的公司级 report artifact
#   - Step 3 = 3A only
#   - Step 4 = integration + driver eligibility only
#   - Step 5 = segment-level annual forecast
#   - Step 7 = parameter claims + essential cross-checks
#   - Pipeline audit = blocking-issue focused
#
# FULL MODE:
#   - 仅在需要更高粒度时使用
#   - Step 3 = 3A + 3B
#   - Step 4 = integration + differentiation + causality + flywheel
#   - Step 5 = quarterly and optionally product-level
#   - Pipeline audit = full cross-step integrity
#
# REQUIRED IN BOTH MODES:
#   - Step 1 canonical name integrity
#   - Step 2 zero fabrication
#   - Step 5 baseline trace + arithmetic trace
#   - Step 7 parameter claim completeness
#   - Final audit weak-inference exposure
#
# ════════════════════════════════════════
# GLOBAL DISCIPLINE RULES
# ════════════════════════════════════════
#
# Evidence Levels:
#   [DISCLOSED]        = source directly states it
#   [STRONG_INFERENCE] = one-step derivation from disclosed source
#   [WEAK_INFERENCE]   = multi-step inference or causal assumption
#   [UNSUPPORTED]      = no reliable support found
#
# Claim Rule:
#   Every factual statement that will feed a downstream step must have:
#   claim_id / claim_text / source_snippet / source_location / evidence_level
#
# Name Rule:
#   Steps 2-7 must use Step 1 canonical names only.
#
# Causal Rule:
#   No causal wording without causal language in source.
#
# Workflow Rule:
#   If a step is BLOCKED, pipeline stops.
#   If a step is NEEDS_REVIEW, orchestrator pauses at the corresponding H-node.
#
# Default User Experience Rule:
#   End users should not see raw checkpoints by default.
#   End users see:
#   - concise result
#   - confidence
#   - top 3 assumptions
#   - unresolved review items if any
#
# Step files:
#   01 = Step 1
#   02 = Step 2
#   03 = Step 3
#   04 = Step 4
#   05 = Step 4.5
#   06 = Step 5/6
#   07 = Step 7
#   08 = Final pipeline audit
