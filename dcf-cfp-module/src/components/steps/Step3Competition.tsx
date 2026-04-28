"use client";

import { useState, useRef, useCallback } from "react";
import {
  Loader2,
  Download,
  Trash2,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Send,
  Swords,
  Shield,
  ShoppingCart,
  DoorOpen,
  RefreshCw,
  ArrowRight,
  Save,
} from "lucide-react";
import StepShell from "./StepShell";
import { useSettings } from "@/context/SettingsContext";
import { useCFP } from "@/context/CFPContext";
import type {
  CategoryCompetitionEntry,
  AnalyzeCompetitionResponse,
  ReviseCompetitionResponse,
  ForceDetail,
  Step3ReviewState,
  Step3StructuredCategory,
  Step3StructuredResult,
} from "@/types/cfp";

// =============================================================================
// Helpers
// =============================================================================

const FORCE_LABELS: { key: keyof CategoryCompetitionEntry["forces"]; label: string; icon: typeof Swords }[] = [
  { key: "rivalry", label: "Competitive Rivalry", icon: Swords },
  { key: "newEntrants", label: "Threat of New Entrants", icon: DoorOpen },
  { key: "suppliers", label: "Supplier Power", icon: RefreshCw },
  { key: "buyers", label: "Buyer Power", icon: ShoppingCart },
  { key: "substitutes", label: "Threat of Substitutes", icon: Shield },
];

function ratingColor(rating: string): string {
  const r = rating.toLowerCase();
  if (r === "low") return "text-emerald-400 bg-emerald-500/10 border-emerald-500/30";
  if (r === "medium") return "text-amber-400 bg-amber-500/10 border-amber-500/30";
  return "text-red-400 bg-red-500/10 border-red-500/30";
}

/** Convert finalized data to a readable text report */
function buildTextReport(companyName: string, categories: CategoryCompetitionEntry[]): string {
  const lines: string[] = [];
  const divider = "=".repeat(72);
  const subDivider = "-".repeat(48);

  lines.push(divider);
  lines.push(`  PORTER'S FIVE FORCES ANALYSIS`);
  lines.push(`  Company: ${companyName}`);
  lines.push(`  Generated: ${new Date().toLocaleDateString("en-US")}`);
  lines.push(divider);
  lines.push("");

  for (let i = 0; i < categories.length; i++) {
    const c = categories[i];
    lines.push(`${i + 1}. CATEGORY: ${c.category}`);
    lines.push(subDivider);
    lines.push(`   Primary Competitor:  ${c.primaryCompetitor}`);
    lines.push(`   Competitive Status:  ${c.competitiveStatus}`);
    lines.push(`   Basis for Pairing:   ${c.basisForPairing}`);
    lines.push("");
    lines.push("   FORCES:");
    for (const f of FORCE_LABELS) {
      const detail: ForceDetail = c.forces[f.key];
      lines.push(`     ${f.label.padEnd(28)} [${detail.rating.toUpperCase()}]`);
      lines.push(`       ${detail.justification}`);
    }
    lines.push("");
  }

  lines.push(divider);
  lines.push("  END OF REPORT");
  lines.push(divider);
  return lines.join("\n");
}

// =============================================================================
// Step 3 — Competitive Landscape: Porter's Five Forces with Chat Revision
// =============================================================================

export default function Step3Competition() {
  const { state, dispatch } = useCFP();
  const hasArchitecture = !!state.profile.architectureJson;
  const isAlreadySaved = state.competition.approved && state.competition.categories.length > 0;

  // ---------- Settings (centralized API key) ----------
  const { settings, activeApiKey } = useSettings();

  // ---------- Phase state ----------
  const [phase, setPhase] = useState<"generate" | "review" | "finalized">(
    isAlreadySaved ? "finalized" : "generate",
  );
  const [categories, setCategories] = useState<CategoryCompetitionEntry[]>(
    isAlreadySaved ? state.competition.categories : [],
  );
  const [structuredResult, setStructuredResult] = useState<Step3StructuredResult | null>(
    isAlreadySaved ? state.competition.structuredResult : null,
  );
  const [step3Review, setStep3Review] = useState<Step3ReviewState | null>(
    isAlreadySaved ? state.competition.step3Review : null,
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [approvedFlags, setApprovedFlags] = useState<boolean[]>([]);

  // ---------- Loading / error ----------
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ---------- Chat state ----------
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // ------------------------------------------------------------------
  // Phase 1 — Generate initial analysis
  // ------------------------------------------------------------------
  const handleGenerate = useCallback(async () => {
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/analyze-competition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyName: state.profile.companyName,
          architecture: state.profile.architectureJson,
          apiKey: activeApiKey,
          llmProvider: settings.llmProvider,
        }),
      });

      const data: AnalyzeCompetitionResponse = await res.json();

      if (!res.ok) {
        if (data.requiresApiKey) throw new Error("No API key configured. Open Settings (gear icon) to add your key.");
        throw new Error(data.error || `Server error (${res.status})`);
      }

      setCategories(data.categories);
      setStructuredResult(data.structuredResult ?? null);
      setStep3Review(data.step3Review ?? null);
      setApprovedFlags(new Array(data.categories.length).fill(false));
      setCurrentIndex(0);
      setChatHistory([]);
      setChatInput("");
      setPhase("review");
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Generation failed.");
    } finally {
      setIsLoading(false);
    }
  }, [state.profile.companyName, state.profile.architectureJson, activeApiKey, settings.llmProvider]);

  // ------------------------------------------------------------------
  // Phase 2 — Send revision
  // ------------------------------------------------------------------
  const handleRevise = useCallback(async () => {
    const feedback = chatInput.trim();
    if (!feedback || isLoading) return;

    setChatHistory((h) => [...h, { role: "user", text: feedback }]);
    setChatInput("");
    setErrorMsg(null);
    setIsLoading(true);

    try {
      const res = await fetch("/api/revise-competition", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          categoryData: categories[currentIndex],
          structuredCategory: structuredResult?.categories[currentIndex] ?? null,
          userFeedback: feedback,
          apiKey: activeApiKey,
          llmProvider: settings.llmProvider,
        }),
      });

      const data: ReviseCompetitionResponse = await res.json();

      if (!res.ok) {
        if (data.requiresApiKey) throw new Error("No API key configured. Open Settings (gear icon) to add your key.");
        throw new Error(data.error || `Server error (${res.status})`);
      }

      setCategories((prev) => prev.map((c, i) => (i === currentIndex ? data.category : c)));
      if (data.structuredCategory) {
        setStructuredResult((prev) =>
          prev
            ? {
                ...prev,
                categories: prev.categories.map((category, i) =>
                  i === currentIndex ? data.structuredCategory as Step3StructuredCategory : category,
                ),
              }
            : prev,
        );
        setStep3Review((prev) =>
          prev
            ? {
                ...prev,
                categories: prev.categories.map((category, i) =>
                  i === currentIndex
                    ? {
                        ...category,
                        humanReviewRequired: data.structuredCategory?.human_review_required ?? category.humanReviewRequired,
                        sourceQuality: data.structuredCategory?.source_quality ?? category.sourceQuality,
                        confidence: data.structuredCategory?.confidence ?? category.confidence,
                        verificationNote: data.structuredCategory?.verification_note ?? category.verificationNote,
                        editable: {
                          primaryCompetitor:
                            data.structuredCategory?.primary_competitor ?? category.editable.primaryCompetitor,
                          competitiveStatus:
                            data.structuredCategory?.competitive_status ?? category.editable.competitiveStatus,
                          basisForPairing:
                            data.structuredCategory?.basis_for_pairing ?? category.editable.basisForPairing,
                        },
                        forces: data.structuredCategory?.forces ?? category.forces,
                      }
                    : category,
                ),
              }
            : prev,
        );
      }
      setChatHistory((h) => [...h, { role: "ai", text: "Analysis updated based on your feedback." }]);

      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Revision failed.";
      setErrorMsg(msg);
      setChatHistory((h) => [...h, { role: "ai", text: `Error: ${msg}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [chatInput, categories, currentIndex, activeApiKey, settings.llmProvider, isLoading, structuredResult]);

  const updateCurrentCategory = useCallback(
    <K extends keyof Pick<CategoryCompetitionEntry, "primaryCompetitor" | "competitiveStatus" | "basisForPairing">>(
      field: K,
      value: CategoryCompetitionEntry[K],
    ) => {
      setCategories((prev) =>
        prev.map((category, i) =>
          i === currentIndex ? { ...category, [field]: value } : category,
        ),
      );

      setStructuredResult((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          categories: prev.categories.map((category, i) => {
            if (i !== currentIndex) return category;
            return {
              ...category,
              primary_competitor:
                field === "primaryCompetitor" ? String(value) : category.primary_competitor,
              competitive_status:
                field === "competitiveStatus"
                  ? (value as Step3StructuredCategory["competitive_status"])
                  : category.competitive_status,
              basis_for_pairing:
                field === "basisForPairing" ? String(value) : category.basis_for_pairing,
              human_review_required: true,
            };
          }),
        };
      });

      setStep3Review((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          workflowStatus: "needs_review",
          categories: prev.categories.map((category, i) => {
            if (i !== currentIndex) return category;
            return {
              ...category,
              humanReviewRequired: true,
              editable: {
                ...category.editable,
                primaryCompetitor:
                  field === "primaryCompetitor"
                    ? String(value)
                    : category.editable.primaryCompetitor,
                competitiveStatus:
                  field === "competitiveStatus"
                    ? (value as Step3StructuredCategory["competitive_status"])
                    : category.editable.competitiveStatus,
                basisForPairing:
                  field === "basisForPairing"
                    ? String(value)
                    : category.editable.basisForPairing,
              },
            };
          }),
        };
      });
    },
    [currentIndex],
  );

  // ------------------------------------------------------------------
  // Approve current category & advance
  // ------------------------------------------------------------------
  const handleApprove = () => {
    setApprovedFlags((prev) => prev.map((v, i) => (i === currentIndex ? true : v)));
    setChatHistory([]);
    setChatInput("");
    setErrorMsg(null);

    if (currentIndex < categories.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      // All approved
      setPhase("finalized");
    }
  };

  // ------------------------------------------------------------------
  // Save to global context
  // ------------------------------------------------------------------
  const handleSaveToContext = () => {
    const approvedReview = step3Review
      ? {
          ...step3Review,
          workflowStatus: "can_continue" as const,
          approved: true,
          approvedAt: new Date().toISOString(),
        }
      : null;
    dispatch({
      type: "SET_COMPETITION",
      payload: {
        categories,
        structuredResult,
        step3Review: approvedReview,
        approved: true,
      },
    });
  };

  // ------------------------------------------------------------------
  // Text export download
  // ------------------------------------------------------------------
  const handleDownload = () => {
    const text = buildTextReport(state.profile.companyName || "Company", categories);
    const now = new Date();
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const yyyy = now.getFullYear();
    const safeName = (state.profile.companyName || "company").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const filename = `${safeName}-step3-${mm}-${dd}-${yyyy}.txt`;

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Current category
  const current = categories[currentIndex] ?? null;
  const currentReview = step3Review?.categories[currentIndex] ?? null;

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <StepShell
      stepNumber={3}
      title="Competitive Landscape"
      subtitle="Porter's Five Forces analysis per product category — review and refine with AI."
    >
      {/* Missing architecture */}
      {!hasArchitecture && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/30 p-4 text-sm text-amber-300">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Step 1 architecture not found</p>
            <p className="mt-1 text-xs text-amber-400/70">Complete Step 1 first to provide the product architecture.</p>
          </div>
        </div>
      )}

      {hasArchitecture && (
        <div className="space-y-6">

          {/* ============================================================ */}
          {/* PHASE 1 — Generate                                           */}
          {/* ============================================================ */}
          {phase === "generate" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <Swords size={40} className="text-blue-400" />
              <p className="text-zinc-400">
                Generate a Porter&apos;s Five Forces analysis for each product category.
              </p>
              {errorMsg && (
                <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" /> {errorMsg}
                </div>
              )}
              <button
                onClick={handleGenerate}
                disabled={isLoading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
              >
                {isLoading ? <><Loader2 size={18} className="animate-spin" /> Generating...</> : "Generate Initial Analysis"}
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* PHASE 2 — Review (one category at a time)                    */}
          {/* ============================================================ */}
          {phase === "review" && current && (
            <div className="space-y-5">
              {step3Review && (
                <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold text-zinc-100">Step 3 Review Gate</p>
                      <p className="mt-1 text-sm text-zinc-400">{step3Review.summary.oneLine}</p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-semibold ${
                        step3Review.workflowStatus === "can_continue"
                          ? "bg-emerald-600/15 text-emerald-300"
                          : "bg-amber-600/15 text-amber-300"
                      }`}
                    >
                      {step3Review.workflowStatus === "can_continue" ? "Ready for Step 4" : "Review required"}
                    </span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    {step3Review.summary.highlights.map((highlight) => (
                      <div key={highlight} className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
                        {highlight}
                      </div>
                    ))}
                  </div>
                  {step3Review.summary.warnings.length > 0 && (
                    <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-200/90">
                      {step3Review.summary.warnings.join(" ")}
                    </div>
                  )}
                </section>
              )}

              {/* Progress indicator */}
              <div className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono">
                  {currentIndex + 1}/{categories.length}
                </span>
                Reviewing categories
                <div className="ml-auto flex gap-1">
                  {categories.map((_, i) => (
                    <div key={i} className={`h-2 w-6 rounded-full ${approvedFlags[i] ? "bg-emerald-500" : i === currentIndex ? "bg-blue-500" : "bg-zinc-700"}`} />
                  ))}
                </div>
              </div>

              {/* Category card */}
              <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5">
                <h4 className="text-lg font-semibold text-zinc-100">{current.category}</h4>
                <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                  <label className="block">
                    <span className="text-xs text-zinc-500">Primary competitor</span>
                    <input
                      type="text"
                      value={current.primaryCompetitor}
                      onChange={(event) => updateCurrentCategory("primaryCompetitor", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-zinc-500">Competitive status</span>
                    <select
                      value={current.competitiveStatus}
                      onChange={(event) => updateCurrentCategory("competitiveStatus", event.target.value)}
                      className="mt-1 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    >
                      <option value="Leader">Leader</option>
                      <option value="Challenger">Challenger</option>
                      <option value="Unclear">Unclear</option>
                    </select>
                  </label>
                  <label className="block sm:col-span-1">
                    <span className="text-xs text-zinc-500">Basis for pairing</span>
                    <textarea
                      value={current.basisForPairing}
                      onChange={(event) => updateCurrentCategory("basisForPairing", event.target.value)}
                      rows={3}
                      className="mt-1 w-full resize-none rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                    />
                  </label>
                </div>
                {(current.verificationNote || current.confidence || current.sourceQuality) && (
                  <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs text-zinc-400">
                    <div className="flex flex-wrap gap-3">
                      {current.confidence && (
                        <span><span className="text-zinc-500">Confidence:</span> {current.confidence}</span>
                      )}
                      {current.sourceQuality && (
                        <span><span className="text-zinc-500">Source quality:</span> {current.sourceQuality}</span>
                      )}
                    </div>
                    {current.verificationNote && (
                      <p className="mt-1 text-zinc-500">{current.verificationNote}</p>
                    )}
                  </div>
                )}
                {currentReview && (
                  <div className="mt-3 rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs text-zinc-400">
                    <div className="flex flex-wrap gap-3">
                      <span><span className="text-zinc-500">Materiality:</span> {currentReview.materiality}</span>
                      <span><span className="text-zinc-500">Step 1 IDs:</span> {currentReview.mappedFromStep1Ids.join(", ")}</span>
                      <span><span className="text-zinc-500">Claims:</span> {currentReview.basisClaimIds.join(", ")}</span>
                    </div>
                    {currentReview.sources.length > 0 && (
                      <div className="mt-2 space-y-1">
                        {currentReview.sources.map((source) => (
                          <p key={source.source_id} className="text-zinc-500">
                            <span className="text-zinc-400">{source.name}</span>
                            {source.locator ? ` · ${source.locator}` : ""}
                            {source.url ? ` · ${source.url}` : ""}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Five Forces table */}
                <div className="mt-4 space-y-2">
                  {FORCE_LABELS.map(({ key, label, icon: Icon }) => {
                    const detail: ForceDetail = current.forces[key];
                    return (
                      <div key={key} className="flex items-start gap-3 rounded-lg bg-zinc-950 px-3 py-2.5">
                        <Icon size={16} className="mt-0.5 shrink-0 text-zinc-500" />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-zinc-300">{label}</span>
                            <span className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${ratingColor(detail.rating)}`}>
                              {detail.rating}
                            </span>
                          </div>
                          <p className="mt-0.5 text-xs text-zinc-500">{detail.justification}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chat history */}
              {chatHistory.length > 0 && (
                <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3">
                  {chatHistory.map((msg, i) => (
                    <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                      <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${msg.role === "user" ? "bg-blue-600/20 text-blue-300" : "bg-zinc-800 text-zinc-400"}`}>
                        {msg.text}
                      </div>
                    </div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
              )}

              {/* Chat input */}
              <div className="flex gap-2">
                <input
                  type="text"
                  placeholder="Provide corrections or context..."
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleRevise(); } }}
                  disabled={isLoading}
                  className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                />
                <button
                  onClick={handleRevise}
                  disabled={isLoading || !chatInput.trim()}
                  className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  Revise
                </button>
              </div>

              {/* Error */}
              {errorMsg && (
                <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300">
                  <AlertCircle size={16} className="mt-0.5 shrink-0" /> {errorMsg}
                </div>
              )}

              {/* Approve button */}
              <button
                onClick={handleApprove}
                disabled={isLoading}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
              >
                <CheckCircle2 size={16} />
                I Agree — Approve &amp; {currentIndex < categories.length - 1 ? "Next" : "Finalize"}
                {currentIndex < categories.length - 1 && <ArrowRight size={14} />}
              </button>
            </div>
          )}

          {/* ============================================================ */}
          {/* PHASE 3 — Finalized (read-only + export)                     */}
          {/* ============================================================ */}
          {phase === "finalized" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-emerald-400">
                <CheckCircle2 size={20} />
                <span className="text-sm font-medium">
                  All {categories.length} categories approved
                </span>
              </div>

              {step3Review && (
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                  <p className="text-sm font-semibold text-zinc-100">Review summary</p>
                  <p className="mt-1 text-sm text-zinc-400">{step3Review.summary.oneLine}</p>
                  {step3Review.validationWarnings.length > 0 && (
                    <div className="mt-3 rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-200/90">
                      {step3Review.validationWarnings.map((warning) => warning.message).join(" ")}
                    </div>
                  )}
                </div>
              )}

              {/* Summary cards */}
              <div className="space-y-3">
                {categories.map((cat, i) => (
                  <details key={i} className="group rounded-lg border border-zinc-800 bg-zinc-950">
                    <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm font-medium text-zinc-200 hover:bg-zinc-900">
                      <ChevronRight size={14} className="text-zinc-500 transition-transform group-open:rotate-90" />
                      <span className="flex-1">{cat.category}</span>
                      <span className="text-xs text-zinc-500">vs. {cat.primaryCompetitor}</span>
                    </summary>
                    <div className="border-t border-zinc-800 px-4 py-3">
                      <div className="mb-2 text-xs text-zinc-500">
                        <span className="text-zinc-400">Status:</span> {cat.competitiveStatus} &middot;{" "}
                        <span className="text-zinc-400">Basis:</span> {cat.basisForPairing}
                      </div>
                      {(cat.verificationNote || cat.confidence || cat.sourceQuality) && (
                        <div className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2 text-xs text-zinc-500">
                          {cat.confidence && <span className="mr-3">Confidence: {cat.confidence}</span>}
                          {cat.sourceQuality && <span>Source: {cat.sourceQuality}</span>}
                          {cat.verificationNote && <p className="mt-1">{cat.verificationNote}</p>}
                        </div>
                      )}
                      <div className="space-y-1.5">
                        {FORCE_LABELS.map(({ key, label }) => {
                          const d: ForceDetail = cat.forces[key];
                          return (
                            <div key={key} className="flex items-center gap-2 text-xs">
                              <span className="w-44 text-zinc-400">{label}</span>
                              <span className={`rounded-full border px-2 py-0.5 font-semibold ${ratingColor(d.rating)}`}>{d.rating}</span>
                              <span className="text-zinc-600">{d.justification}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </details>
                ))}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <button
                  onClick={handleSaveToContext}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
                >
                  <Save size={16} />
                  Save to Master Framework
                </button>

                <button
                  onClick={handleDownload}
                  className="flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-600/10 px-5 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-600/20"
                >
                  <Download size={16} />
                  Download Detailed Text Report
                </button>

                <button
                  onClick={() => {
                    dispatch({ type: "CLEAR_COMPETITION" });
                    setCategories([]);
                    setStructuredResult(null);
                    setStep3Review(null);
                    setApprovedFlags([]);
                    setCurrentIndex(0);
                    setChatHistory([]);
                    setPhase("generate");
                  }}
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm text-zinc-400 hover:border-red-700/50 hover:text-red-400"
                >
                  <Trash2 size={16} />
                  Start Over
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </StepShell>
  );
}
