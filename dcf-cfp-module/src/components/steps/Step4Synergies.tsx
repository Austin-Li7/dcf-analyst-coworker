"use client";

import { useState, useRef, useCallback } from "react";
import {
  Loader2, Download, Trash2, AlertTriangle, AlertCircle,
  CheckCircle2, ChevronRight, Send, Zap, ArrowRight,
  Save, RefreshCw, TrendingUp, Newspaper, Building2,
} from "lucide-react";
import * as XLSX from "xlsx";
import StepShell from "./StepShell";
import { useSettings } from "@/context/SettingsContext";
import { useCFP } from "@/context/CFPContext";
import type {
  CapabilityPenetrationPath, AnalyzeSynergiesResponse, ReviseSynergiesResponse,
  CapitalAllocationData, CapitalCheckpoints,
  AnalyzeCapitalResponse, ReviseCapitalResponse,
  Step4ReviewState,
  Step4StructuredResult,
} from "@/types/cfp";

// =============================================================================
// Phase type
// =============================================================================
type Phase =
  | "synergies-gen"
  | "synergies-review"
  | "news-intake"
  | "capital-review"
  | "dashboard";

// =============================================================================
// Helpers
// =============================================================================
function scoreColor(s: number) { return s >= 3 ? "text-emerald-400" : s >= 1 ? "text-emerald-300" : s === 0 ? "text-zinc-400" : s >= -2 ? "text-amber-400" : "text-red-400"; }
function scoreBg(s: number) { return s >= 3 ? "bg-emerald-500" : s >= 1 ? "bg-emerald-400" : s === 0 ? "bg-zinc-500" : s >= -2 ? "bg-amber-500" : "bg-red-500"; }
function dateSuffix() { const n = new Date(); return `${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}-${n.getFullYear()}`; }
function sName(c: string) { return (c || "company").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase(); }

function buildTextReport(
  companyName: string,
  paths: CapabilityPenetrationPath[],
  capital: CapitalAllocationData | null,
) {
  const l: string[] = [];
  const div = "=".repeat(72);
  const sub = "-".repeat(48);

  l.push(div);
  l.push("  STEP 4 COMPLETE: SYNERGIES + CAPITAL ALLOCATION");
  l.push(`  Company: ${companyName}`);
  l.push(`  Generated: ${new Date().toLocaleDateString("en-US")}`);
  l.push(div);

  // Part A — Synergies
  l.push(""); l.push("  PART A: CROSS-BUSINESS CAPABILITY PENETRATION"); l.push(sub); l.push("");
  for (let i = 0; i < paths.length; i++) {
    const p = paths[i];
    l.push(`  ${i+1}. ${p.sourceBusiness}  -->  ${p.recipientBusiness}`);
    l.push(`     Capability:  ${p.coreCapability}`);
    l.push(`     Mechanism:   ${p.mechanism}`);
    l.push(`     Impact:      ${p.productImpact}`);
    l.push(`     Constraint:  ${p.competitorConstraint}`);
    l.push(`     Financial:   ${p.financialSignal.type} (${p.financialSignal.status})`);
    l.push(`     Evidence:    ${p.financialSignal.evidence}`);
    l.push(`     Review:      ${p.synergyClassification ?? "Not classified"}`);
    if (p.reviewRationale) l.push(`     Rationale:   ${p.reviewRationale}`);
    l.push(`     Flywheel:    ${p.flywheel.isFlywheel ? `Yes — ${p.flywheel.loopDescription}` : "No"}`);
    l.push(`     SCORE:       ${p.impactScore > 0 ? "+" : ""}${p.impactScore}/5`);
    l.push("");
  }
  const avg = paths.length ? paths.reduce((s,p) => s+p.impactScore,0)/paths.length : 0;
  l.push(`  Avg Impact Score: ${avg.toFixed(1)}  |  Flywheels: ${paths.filter(p=>p.flywheel.isFlywheel).length}/${paths.length}`);

  // Part B — Capital
  if (capital) {
    l.push(""); l.push(div); l.push("  PART B: CAPITAL ALLOCATION"); l.push(sub); l.push("");
    for (let i = 0; i < capital.investmentMatrix.length; i++) {
      const e = capital.investmentMatrix[i];
      l.push(`  ${i+1}. Pillar: ${e.pillar}`);
      l.push(`     Objective:         ${e.objective}`);
      l.push(`     Capital Intensity: ${e.capitalIntensity}`);
      l.push(`     Strategic Leverage: ${e.strategicLeverage}`);
      l.push(`     Synergy Link:      ${e.synergyLink}`);
      l.push(`     Efficiency Score:  ${e.efficiencyScore > 0 ? "+" : ""}${e.efficiencyScore}/5`);
      l.push("");
    }
    l.push("  CHECKPOINTS:");
    l.push(`     CapEx Runway:          ${capital.checkpoints.capexRunway}`);
    l.push(`     Subsidiary Margin:     ${capital.checkpoints.subsidiaryMargin}`);
    l.push(`     Investment Efficiency: ${capital.checkpoints.investmentEfficiency}`);
  }

  l.push(""); l.push(div); l.push("  END OF REPORT"); l.push(div);
  return l.join("\n");
}

// =============================================================================
// Reusable sub-components
// =============================================================================
function ChatBox({ history, input, setInput, onSend, isLoading, endRef }: {
  history: { role: "user" | "ai"; text: string }[];
  input: string; setInput: (v: string) => void;
  onSend: () => void; isLoading: boolean;
  endRef: React.RefObject<HTMLDivElement | null>;
}) {
  return (
    <>
      {history.length > 0 && (
        <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950 p-3">
          {history.map((m, i) => (
            <div key={i} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-lg px-3 py-2 text-xs ${m.role === "user" ? "bg-blue-600/20 text-blue-300" : "bg-zinc-800 text-zinc-400"}`}>{m.text}</div>
            </div>
          ))}
          <div ref={endRef} />
        </div>
      )}
      <div className="flex gap-2">
        <input type="text" placeholder="Provide corrections or context..." value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); onSend(); } }}
          disabled={isLoading}
          className="min-w-0 flex-1 rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 disabled:opacity-50" />
        <button onClick={onSend} disabled={isLoading || !input.trim()}
          className="flex shrink-0 items-center gap-1.5 rounded-lg bg-zinc-700 px-4 py-2.5 text-sm font-medium text-zinc-200 hover:bg-zinc-600 disabled:cursor-not-allowed disabled:opacity-50">
          {isLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} Revise
        </button>
      </div>
    </>
  );
}

function ScoreSlider({ value, onChange, label }: { value: number; onChange: (v: number) => void; label?: string }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-sm font-medium text-zinc-300">{label || "Assess Financial Impact"}</label>
        <span className={`text-lg font-bold tabular-nums ${scoreColor(value)}`}>{value > 0 ? "+" : ""}{value}</span>
      </div>
      <input type="range" min={-5} max={5} step={1} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-blue-500" />
      <div className="flex justify-between text-xs text-zinc-600"><span>-5 Very Negative</span><span>0 Neutral</span><span>+5 Very Positive</span></div>
    </div>
  );
}

function ProgressDots({ total, current, approved }: { total: number; current: number; approved: boolean[] }) {
  return (
    <div className="flex items-center gap-2 text-xs text-zinc-500">
      <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono">{current+1}/{total}</span>
      <div className="ml-auto flex gap-1">
        {Array.from({ length: total }, (_, i) => (
          <div key={i} className={`h-2 w-6 rounded-full ${approved[i] ? "bg-emerald-500" : i === current ? "bg-blue-500" : "bg-zinc-700"}`} />
        ))}
      </div>
    </div>
  );
}

function SourceGrounding({ sources }: { sources: Step4ReviewState["synergies"][number]["sources"] }) {
  if (sources.length === 0) return null;

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-xs text-zinc-500">
      <p className="font-medium text-zinc-400">Source grounding</p>
      <div className="mt-1 space-y-1">
        {sources.map((source) => (
          <p key={source.source_id}>
            <span className="text-zinc-300">{source.name}</span>
            {source.locator ? ` · ${source.locator}` : ""}
            {source.url ? ` · ${source.url}` : ""}
          </p>
        ))}
      </div>
    </div>
  );
}

function ReviewSummaryPanel({ review }: { review: Step4ReviewState }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm font-semibold text-zinc-100">Step 4 Review Gate</p>
        <span
          className={`rounded-full border px-2 py-0.5 text-xs ${
            review.workflowStatus === "can_continue"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border-amber-500/30 bg-amber-500/10 text-amber-300"
          }`}
        >
          {review.workflowStatus === "can_continue" ? "Ready for Step 5" : "Review required"}
        </span>
      </div>
      <p className="mt-1 text-sm text-zinc-400">{review.summary.oneLine}</p>
      {review.summary.highlights.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {review.summary.highlights.map((highlight) => (
            <span key={highlight} className="rounded-full bg-blue-500/10 px-2 py-1 text-xs text-blue-300">
              {highlight}
            </span>
          ))}
        </div>
      )}
      {review.summary.warnings.length > 0 && (
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-xs text-amber-300">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>{review.summary.warnings.join(" ")}</span>
        </div>
      )}
      {review.validationWarnings.length > 0 && (
        <p className="mt-2 text-xs text-zinc-500">
          {review.validationWarnings.map((warning) => warning.message).join(" ")}
        </p>
      )}
    </div>
  );
}

// =============================================================================
// Main Component
// =============================================================================
export default function Step4Synergies() {
  const { state, dispatch } = useCFP();
  const hasArch = !!state.profile.architectureJson;
  const isFullySaved = state.synergies.synergiesApproved && state.synergies.capitalApproved;

  // ---- Settings (centralized API key) ----
  const { settings, activeApiKey } = useSettings();

  // ---- Phase ----
  const [phase, setPhase] = useState<Phase>(isFullySaved ? "dashboard" : "synergies-gen");

  // ---- Synergies (4A) ----
  const [paths, setPaths] = useState<CapabilityPenetrationPath[]>(isFullySaved ? state.synergies.paths : []);
  const [step4Structured, setStep4Structured] = useState<Step4StructuredResult | null>(
    state.synergies.structuredResult,
  );
  const [step4Review, setStep4Review] = useState<Step4ReviewState | null>(
    state.synergies.step4Review,
  );
  const [synIdx, setSynIdx] = useState(0);
  const [synApproved, setSynApproved] = useState<boolean[]>([]);

  // ---- Capital (4B) ----
  const [capitalData, setCapitalData] = useState<CapitalAllocationData | null>(isFullySaved ? state.synergies.capital : null);
  const [capIdx, setCapIdx] = useState(0);
  const [capApproved, setCapApproved] = useState<boolean[]>([]);
  const [checkpointsApproved, setCheckpointsApproved] = useState(false);
  const [newsText, setNewsText] = useState(state.synergies.recentNews || "");

  // ---- Shared ----
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [chatHistory, setChatHistory] = useState<{ role: "user" | "ai"; text: string }[]>([]);
  const chatEndRef = useRef<HTMLDivElement>(null);

  const resetChat = () => { setChatInput(""); setChatHistory([]); setErrorMsg(null); };

  // ================================================================
  // PHASE 1 — Generate synergies
  // ================================================================
  const genSynergies = useCallback(async () => {
    setErrorMsg(null); setIsLoading(true);
    try {
      const res = await fetch("/api/analyze-synergies", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step1Architecture: state.profile.architectureJson, step2Financials: state.history, step3Competition: state.competition, apiKey: activeApiKey, llmProvider: settings.llmProvider }) });
      const d: AnalyzeSynergiesResponse = await res.json();
      if (!res.ok) { if (d.requiresApiKey) throw new Error("No API key configured. Open Settings (gear icon) to add your key."); throw new Error(d.error); }
      setPaths(d.paths);
      setStep4Structured(d.structuredResult ?? null);
      setStep4Review(d.step4Review ?? null);
      setSynApproved(new Array(d.paths.length).fill(false)); setSynIdx(0); resetChat(); setPhase("synergies-review");
    } catch (e: unknown) { setErrorMsg(e instanceof Error ? e.message : "Failed."); } finally { setIsLoading(false); }
  }, [state.profile.architectureJson, state.history, state.competition, activeApiKey, settings.llmProvider]);

  // ================================================================
  // PHASE 2 — Revise synergy
  // ================================================================
  const reviseSynergy = useCallback(async () => {
    const fb = chatInput.trim(); if (!fb || isLoading) return;
    setChatHistory(h => [...h, { role: "user", text: fb }]); setChatInput(""); setErrorMsg(null); setIsLoading(true);
    try {
      const res = await fetch("/api/revise-synergies", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pathData: paths[synIdx], userFeedback: fb, apiKey: activeApiKey, llmProvider: settings.llmProvider }) });
      const d: ReviseSynergiesResponse = await res.json();
      if (!res.ok) { if (d.requiresApiKey) throw new Error("No API key configured. Open Settings (gear icon) to add your key."); throw new Error(d.error); }
      const updated = { ...d.path, impactScore: paths[synIdx].impactScore };
      setPaths(p => p.map((x, i) => i === synIdx ? updated : x));
      setChatHistory(h => [...h, { role: "ai", text: "Updated." }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: unknown) { const m = e instanceof Error ? e.message : "Failed."; setErrorMsg(m); setChatHistory(h => [...h, { role: "ai", text: `Error: ${m}` }]); } finally { setIsLoading(false); }
  }, [chatInput, paths, synIdx, activeApiKey, settings.llmProvider, isLoading]);

  const approveSynergy = () => {
    setSynApproved(p => p.map((v, i) => i === synIdx ? true : v)); resetChat();
    if (synIdx < paths.length - 1) setSynIdx(synIdx + 1);
    else setPhase("news-intake");
  };

  // ================================================================
  // PHASE 3 — News intake → generate capital
  // ================================================================
  const genCapital = useCallback(async () => {
    setErrorMsg(null); setIsLoading(true);
    try {
      const res = await fetch("/api/analyze-capital", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ step1Architecture: state.profile.architectureJson, step2Financials: state.history, step4Synergies: paths, recentNews: newsText, apiKey: activeApiKey, llmProvider: settings.llmProvider }) });
      const d: AnalyzeCapitalResponse = await res.json();
      if (!res.ok) { if (d.requiresApiKey) throw new Error("No API key configured. Open Settings (gear icon) to add your key."); throw new Error(d.error); }
      if (d.paths?.length) setPaths(d.paths);
      setCapitalData(d.data);
      setStep4Structured(d.structuredResult ?? step4Structured);
      setStep4Review(d.step4Review ?? step4Review);
      setCapApproved(new Array(d.data.investmentMatrix.length).fill(false)); setCapIdx(0); setCheckpointsApproved(false); resetChat(); setPhase("capital-review");
    } catch (e: unknown) { setErrorMsg(e instanceof Error ? e.message : "Failed."); } finally { setIsLoading(false); }
  }, [state.profile.architectureJson, state.history, paths, newsText, activeApiKey, settings.llmProvider, step4Structured, step4Review]);

  // ================================================================
  // PHASE 4 — Review capital entries
  // ================================================================
  const reviseCapitalEntry = useCallback(async () => {
    if (!capitalData) return;
    const fb = chatInput.trim(); if (!fb || isLoading) return;
    setChatHistory(h => [...h, { role: "user", text: fb }]); setChatInput(""); setErrorMsg(null); setIsLoading(true);
    try {
      const res = await fetch("/api/revise-capital", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ entryData: capitalData.investmentMatrix[capIdx], userFeedback: fb, apiKey: activeApiKey, llmProvider: settings.llmProvider }) });
      const d: ReviseCapitalResponse = await res.json();
      if (!res.ok) { if (d.requiresApiKey) throw new Error("No API key configured. Open Settings (gear icon) to add your key."); throw new Error(d.error); }
      const updated = { ...d.entry, efficiencyScore: capitalData.investmentMatrix[capIdx].efficiencyScore };
      setCapitalData(prev => prev ? { ...prev, investmentMatrix: prev.investmentMatrix.map((x, i) => i === capIdx ? updated : x) } : prev);
      setChatHistory(h => [...h, { role: "ai", text: "Updated." }]);
      setTimeout(() => chatEndRef.current?.scrollIntoView({ behavior: "smooth" }), 100);
    } catch (e: unknown) { const m = e instanceof Error ? e.message : "Failed."; setErrorMsg(m); setChatHistory(h => [...h, { role: "ai", text: `Error: ${m}` }]); } finally { setIsLoading(false); }
  }, [capitalData, capIdx, chatInput, activeApiKey, settings.llmProvider, isLoading]);

  const approveCapitalEntry = () => {
    setCapApproved(p => p.map((v, i) => i === capIdx ? true : v)); resetChat();
    if (capitalData && capIdx < capitalData.investmentMatrix.length - 1) setCapIdx(capIdx + 1);
    // else stay on same phase — user still needs to approve checkpoints
  };

  const allMatrixApproved = capitalData ? capApproved.every(Boolean) : false;

  const approveAllCapital = () => { setCheckpointsApproved(true); setPhase("dashboard"); };

  // ================================================================
  // Save & Export
  // ================================================================
  const handleSave = () => {
    const approvedReview = step4Review
      ? { ...step4Review, approved: true, approvedAt: new Date().toISOString(), workflowStatus: "can_continue" as const }
      : null;
    dispatch({
      type: "SET_SYNERGIES_PATHS",
      payload: { paths, structuredResult: step4Structured, step4Review: approvedReview },
    });
    if (capitalData) {
      dispatch({
        type: "SET_CAPITAL_DATA",
        payload: {
          capital: capitalData,
          recentNews: newsText,
          structuredResult: step4Structured,
          step4Review: approvedReview,
        },
      });
    }
  };

  const dlTxt = () => {
    const blob = new Blob([buildTextReport(state.profile.companyName || "Company", paths, capitalData)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob); const a = document.createElement("a");
    a.href = url; a.download = `${sName(state.profile.companyName)}-step4-complete-${dateSuffix()}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  const dlXlsx = () => {
    const wb = XLSX.utils.book_new();
    // Sheet 1: Synergies
    const synRows = paths.map(p => ({
      "Source": p.sourceBusiness, "Core Capability": p.coreCapability, "Recipient": p.recipientBusiness,
      "Mechanism": p.mechanism, "Product Impact": p.productImpact, "Constraint": p.competitorConstraint,
      "Signal Type": p.financialSignal.type, "Signal Status": p.financialSignal.status,
      "Classification": p.synergyClassification ?? "Not classified", "Review Rationale": p.reviewRationale ?? "",
      "Flywheel": p.flywheel.isFlywheel ? "Yes" : "No", "Impact Score": p.impactScore,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(synRows), "Synergies");
    // Sheet 2: Capital
    if (capitalData) {
      const capRows = capitalData.investmentMatrix.map(e => ({
        "Pillar": e.pillar, "Objective": e.objective, "Capital Intensity": e.capitalIntensity,
        "Strategic Leverage": e.strategicLeverage, "Synergy Link": e.synergyLink, "Efficiency Score": e.efficiencyScore,
      }));
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(capRows), "Capital Allocation");
    }
    XLSX.writeFile(wb, `${sName(state.profile.companyName)}-step4-complete-${dateSuffix()}.xlsx`);
  };

  const startOver = () => {
    dispatch({ type: "CLEAR_SYNERGIES" }); setPaths([]); setSynApproved([]); setSynIdx(0);
    setCapitalData(null); setCapApproved([]); setCapIdx(0); setCheckpointsApproved(false);
    setStep4Structured(null); setStep4Review(null);
    setNewsText(""); resetChat(); setPhase("synergies-gen");
  };

  // Current items
  const curPath = paths[synIdx] ?? null;
  const curEntry = capitalData?.investmentMatrix[capIdx] ?? null;
  const curSynergyReview = step4Review?.synergies[synIdx] ?? null;
  const curCapitalReview = step4Review?.capitalMetrics[capIdx] ?? null;

  // ==========================================================================
  return (
    <StepShell stepNumber={4} title="Synergies & Capital Allocation" subtitle="Map capability penetration, score impact, then analyze capital allocation with real-time news.">
      {!hasArch && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/30 p-4 text-sm text-amber-300">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div><p className="font-medium">Step 1 architecture not found</p><p className="mt-1 text-xs text-amber-400/70">Complete Step 1 first.</p></div>
        </div>
      )}

      {hasArch && (
        <div className="space-y-6">

          {/* ===== SUB-STEP INDICATOR ===== */}
          <div className="flex gap-2 text-xs">
            {(["4A Synergies", "News Intake", "4B Capital", "Dashboard"] as const).map((label, i) => {
              const phaseMap: Phase[] = ["synergies-gen", "news-intake", "capital-review", "dashboard"];
              const active = phase === phaseMap[i] || (i === 0 && phase === "synergies-review");
              const done = phaseMap.indexOf(phase) > i || (i === 0 && (phase !== "synergies-gen" && phase !== "synergies-review"));
              return (
                <span key={i} className={`rounded-full px-3 py-1 font-medium ${done ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : active ? "bg-blue-600/10 text-blue-400 border border-blue-500/30" : "bg-zinc-800 text-zinc-600 border border-zinc-700"}`}>
                  {done ? "✓ " : ""}{label}
                </span>
              );
            })}
          </div>

          {/* ===== PHASE 1: Synergies Generate ===== */}
          {phase === "synergies-gen" && (
            <div className="flex flex-col items-center gap-4 py-8 text-center">
              <Zap size={40} className="text-blue-400" />
              <p className="text-zinc-400">Analyze capability penetration paths and flywheel dynamics.</p>
              {errorMsg && <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {errorMsg}</div>}
              <button onClick={genSynergies} disabled={isLoading} className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500">
                {isLoading ? <><Loader2 size={18} className="animate-spin" /> Mapping...</> : "Map Capability Penetration"}
              </button>
            </div>
          )}

          {/* ===== PHASE 2: Synergies Review ===== */}
          {phase === "synergies-review" && curPath && (
            <div className="space-y-5">
              {step4Review && <ReviewSummaryPanel review={step4Review} />}
              <ProgressDots total={paths.length} current={synIdx} approved={synApproved} />
              {/* Path card */}
              <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-4">
                <div className="flex items-center gap-2 text-sm">
                  <span className="rounded bg-blue-600/20 px-2 py-1 font-medium text-blue-300">{curPath.sourceBusiness}</span>
                  <ArrowRight size={14} className="text-zinc-600" />
                  <span className="rounded bg-purple-600/20 px-2 py-1 font-medium text-purple-300">{curPath.recipientBusiness}</span>
                </div>
                <div className="grid gap-3 text-sm sm:grid-cols-2">
                  <div><span className="text-zinc-500">Capability:</span> <span className="text-zinc-200">{curPath.coreCapability}</span></div>
                  <div><span className="text-zinc-500">Mechanism:</span> <span className="text-zinc-200">{curPath.mechanism}</span></div>
                  <div className="sm:col-span-2"><span className="text-zinc-500">Product Impact:</span> <span className="text-zinc-300">{curPath.productImpact}</span></div>
                  <div className="sm:col-span-2"><span className="text-zinc-500">Constraint:</span> <span className="text-zinc-300">{curPath.competitorConstraint}</span></div>
                </div>
                <div className="rounded-lg bg-zinc-950 p-3 text-sm">
                  <div className="flex items-center gap-2 text-zinc-400"><TrendingUp size={14} /><span className="font-medium">Financial Signal</span>
                    <span className={`ml-auto rounded-full px-2 py-0.5 text-xs font-semibold ${curPath.financialSignal.status === "financially-material" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/30" : "bg-zinc-800 text-zinc-500 border border-zinc-700"}`}>{curPath.financialSignal.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-zinc-500">Type: {curPath.financialSignal.type} | Evidence: {curPath.financialSignal.evidence}</p>
                </div>
                {(curPath.synergyClassification || curPath.reviewRationale) && (
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2 text-zinc-400">
                      <span className="font-medium">Review Classification</span>
                      {curPath.synergyClassification && (
                        <span className="rounded-full border border-zinc-700 bg-zinc-900 px-2 py-0.5 text-xs text-zinc-300">
                          {curPath.synergyClassification}
                        </span>
                      )}
                    </div>
                    {curPath.reviewRationale && (
                      <p className="mt-1 text-xs text-zinc-500">{curPath.reviewRationale}</p>
                    )}
                  </div>
                )}
                {curSynergyReview && (
                  <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
                    <span><span className="text-zinc-400">Integration:</span> {curSynergyReview.integrationVerdict}</span>
                    <span><span className="text-zinc-400">Causality:</span> {curSynergyReview.causalityVerdict}</span>
                    <span><span className="text-zinc-400">Driver:</span> {curSynergyReview.driverEligibility}</span>
                  </div>
                )}
                {curSynergyReview && <SourceGrounding sources={curSynergyReview.sources} />}
                <div className="flex items-center gap-2 rounded-lg bg-zinc-950 px-3 py-2 text-sm">
                  <RefreshCw size={14} className={curPath.flywheel.isFlywheel ? "text-emerald-400" : "text-zinc-600"} />
                  <span className="text-zinc-400">Flywheel:</span>
                  <span className={curPath.flywheel.isFlywheel ? "text-emerald-400 font-medium" : "text-zinc-500"}>{curPath.flywheel.isFlywheel ? "Yes" : "No"}</span>
                  {curPath.flywheel.isFlywheel && <span className="ml-2 text-xs text-zinc-500">{curPath.flywheel.loopDescription}</span>}
                </div>
                <ScoreSlider value={curPath.impactScore} onChange={(v) => setPaths(p => p.map((x,i) => i===synIdx ? {...x, impactScore: v} : x))} />
              </div>
              <ChatBox history={chatHistory} input={chatInput} setInput={setChatInput} onSend={reviseSynergy} isLoading={isLoading} endRef={chatEndRef} />
              {errorMsg && <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {errorMsg}</div>}
              <button onClick={approveSynergy} disabled={isLoading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                <CheckCircle2 size={16} /> Approve &amp; {synIdx < paths.length - 1 ? "Next" : "Continue to Capital"} {synIdx < paths.length - 1 && <ArrowRight size={14} />}
              </button>
            </div>
          )}

          {/* ===== PHASE 3: News Intake ===== */}
          {phase === "news-intake" && (
            <div className="space-y-5">
              <div className="flex items-center gap-2 text-emerald-400"><CheckCircle2 size={18} /><span className="text-sm font-medium">All {paths.length} synergy paths approved</span></div>

              <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-4">
                <div className="flex items-center gap-2"><Newspaper size={20} className="text-amber-400" /><h4 className="text-lg font-semibold text-zinc-100">Include Recent News or Management Commentary</h4></div>
                <p className="text-xs text-zinc-500">Paste recent press releases, M&amp;A announcements, or earnings call snippets regarding CapEx to ensure the model reflects real-time strategy.</p>
                <textarea
                  rows={6} value={newsText} onChange={(e) => setNewsText(e.target.value)} placeholder="(Optional) Paste news, earnings snippets, or commentary here..."
                  className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 resize-y" />
              </div>

              {errorMsg && <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {errorMsg}</div>}

              <button onClick={genCapital} disabled={isLoading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500">
                {isLoading ? <><Loader2 size={18} className="animate-spin" /> Analyzing capital...</> : <><Building2 size={16} /> Generate Capital Allocation Analysis</>}
              </button>
            </div>
          )}

          {/* ===== PHASE 4: Capital Review ===== */}
          {phase === "capital-review" && capitalData && (
            <div className="space-y-5">
              {step4Review && <ReviewSummaryPanel review={step4Review} />}
              {/* Matrix entry review */}
              {!allMatrixApproved && curEntry && (
                <>
                  <ProgressDots total={capitalData.investmentMatrix.length} current={capIdx} approved={capApproved} />
                  <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-4">
                    <div className="flex items-center gap-2"><Building2 size={18} className="text-blue-400" /><h4 className="text-lg font-semibold text-zinc-100">{curEntry.pillar}</h4></div>
                    <div className="grid gap-3 text-sm sm:grid-cols-2">
                      <div><span className="text-zinc-500">Objective:</span> <span className="text-zinc-200">{curEntry.objective}</span></div>
                      <div><span className="text-zinc-500">Capital Intensity:</span> <span className="text-zinc-200">{curEntry.capitalIntensity}</span></div>
                      <div><span className="text-zinc-500">Strategic Leverage:</span> <span className="text-zinc-200">{curEntry.strategicLeverage}</span></div>
                      <div><span className="text-zinc-500">Synergy Link:</span> <span className="text-zinc-300">{curEntry.synergyLink}</span></div>
                    </div>
                    <ScoreSlider label="Efficiency Score" value={curEntry.efficiencyScore} onChange={(v) => setCapitalData(p => p ? { ...p, investmentMatrix: p.investmentMatrix.map((x,i) => i===capIdx ? {...x, efficiencyScore: v} : x) } : p)} />
                    {curCapitalReview && (
                      <>
                        <div className="grid gap-2 text-xs text-zinc-500 sm:grid-cols-3">
                          <span><span className="text-zinc-400">Intensity:</span> {curCapitalReview.capitalIntensity}</span>
                          <span><span className="text-zinc-400">Claim:</span> {curCapitalReview.claimId}</span>
                          <span><span className="text-zinc-400">Link:</span> {curCapitalReview.synergyLink}</span>
                        </div>
                        <p className="rounded-lg bg-zinc-950 px-3 py-2 text-xs text-zinc-500">{curCapitalReview.reviewNote}</p>
                        <SourceGrounding sources={curCapitalReview.sources} />
                      </>
                    )}
                  </div>
                  <ChatBox history={chatHistory} input={chatInput} setInput={setChatInput} onSend={reviseCapitalEntry} isLoading={isLoading} endRef={chatEndRef} />
                  {errorMsg && <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {errorMsg}</div>}
                  <button onClick={approveCapitalEntry} disabled={isLoading} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50">
                    <CheckCircle2 size={16} /> Approve Entry &amp; {capIdx < capitalData.investmentMatrix.length - 1 ? "Next" : "Review Checkpoints"}
                  </button>
                </>
              )}

              {/* Checkpoints review */}
              {allMatrixApproved && !checkpointsApproved && (
                <>
                  <div className="flex items-center gap-2 text-emerald-400"><CheckCircle2 size={18} /><span className="text-sm font-medium">All matrix entries scored</span></div>
                  <div className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-3">
                    <h4 className="text-lg font-semibold text-zinc-100">Financial Feasibility Checkpoints</h4>
                    {(Object.entries(capitalData.checkpoints) as [keyof CapitalCheckpoints, string][]).map(([key, val]) => (
                      <div key={key} className="rounded-lg bg-zinc-950 px-4 py-3">
                        <p className="text-xs font-medium text-zinc-400 uppercase tracking-wider">{key.replace(/([A-Z])/g, " $1").trim()}</p>
                        <p className="mt-1 text-sm text-zinc-200">{val}</p>
                      </div>
                    ))}
                  </div>
                  <button onClick={approveAllCapital} className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white hover:bg-emerald-500">
                    <CheckCircle2 size={16} /> Approve All Capital Data &amp; Finalize
                  </button>
                </>
              )}
            </div>
          )}

          {/* ===== PHASE 5: Dashboard ===== */}
          {phase === "dashboard" && (
            <div className="space-y-6">
              <div className="flex items-center gap-2 text-emerald-400"><CheckCircle2 size={20} /><span className="text-sm font-medium">Step 4 Complete — Synergies &amp; Capital</span></div>
              {step4Review && <ReviewSummaryPanel review={step4Review} />}

              {/* Summary stats */}
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-center">
                  <p className="text-xs text-zinc-500">Synergy Paths</p>
                  <p className="text-2xl font-bold text-blue-400">{paths.length}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-center">
                  <p className="text-xs text-zinc-500">Avg Impact</p>
                  <p className={`text-2xl font-bold ${scoreColor(Math.round(paths.reduce((s,p)=>s+p.impactScore,0)/(paths.length||1)))}`}>
                    {(paths.reduce((s,p)=>s+p.impactScore,0)/(paths.length||1)).toFixed(1)}
                  </p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-center">
                  <p className="text-xs text-zinc-500">Capital Pillars</p>
                  <p className="text-2xl font-bold text-purple-400">{capitalData?.investmentMatrix.length ?? 0}</p>
                </div>
                <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-center">
                  <p className="text-xs text-zinc-500">Flywheels</p>
                  <p className="text-2xl font-bold text-emerald-400">{paths.filter(p=>p.flywheel.isFlywheel).length}</p>
                </div>
              </div>

              {/* Synergies summary */}
              <h5 className="text-sm font-semibold text-zinc-300">Synergy Paths</h5>
              <div className="space-y-2">
                {paths.map((p, i) => (
                  <details key={i} className="group rounded-lg border border-zinc-800 bg-zinc-950">
                    <summary className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-900">
                      <ChevronRight size={14} className="text-zinc-500 transition-transform group-open:rotate-90" />
                      <span className="flex-1 font-medium">{p.sourceBusiness} &rarr; {p.recipientBusiness}</span>
                      <span className={`text-xs font-bold tabular-nums ${scoreColor(p.impactScore)}`}>{p.impactScore > 0 ? "+" : ""}{p.impactScore}</span>
                      <div className={`h-2 w-8 rounded-full ${scoreBg(p.impactScore)}`} style={{ opacity: Math.abs(p.impactScore)/5*0.8+0.2 }} />
                    </summary>
                    <div className="border-t border-zinc-800 px-4 py-3 text-xs text-zinc-400 space-y-1">
                      <p><span className="text-zinc-500">Capability:</span> {p.coreCapability}</p>
                      <p><span className="text-zinc-500">Review:</span> {p.synergyClassification ?? "Not classified"}</p>
                      {p.reviewRationale && <p><span className="text-zinc-500">Rationale:</span> {p.reviewRationale}</p>}
                      <p><span className="text-zinc-500">Financial:</span> {p.financialSignal.type} — {p.financialSignal.status}</p>
                      <p><span className="text-zinc-500">Flywheel:</span> {p.flywheel.isFlywheel ? `Yes — ${p.flywheel.loopDescription}` : "No"}</p>
                    </div>
                  </details>
                ))}
              </div>

              {/* Capital summary */}
              {capitalData && (
                <>
                  <h5 className="text-sm font-semibold text-zinc-300">Capital Allocation</h5>
                  <div className="space-y-2">
                    {capitalData.investmentMatrix.map((e, i) => (
                      <details key={i} className="group rounded-lg border border-zinc-800 bg-zinc-950">
                        <summary className="flex cursor-pointer items-center gap-3 px-4 py-2.5 text-sm text-zinc-200 hover:bg-zinc-900">
                          <ChevronRight size={14} className="text-zinc-500 transition-transform group-open:rotate-90" />
                          <span className="flex-1 font-medium">{e.pillar}</span>
                          <span className={`text-xs font-bold tabular-nums ${scoreColor(e.efficiencyScore)}`}>{e.efficiencyScore > 0 ? "+" : ""}{e.efficiencyScore}</span>
                        </summary>
                        <div className="border-t border-zinc-800 px-4 py-3 text-xs text-zinc-400 space-y-1">
                          <p><span className="text-zinc-500">Objective:</span> {e.objective}</p>
                          <p><span className="text-zinc-500">Intensity:</span> {e.capitalIntensity} | <span className="text-zinc-500">Leverage:</span> {e.strategicLeverage}</p>
                          <p><span className="text-zinc-500">Synergy Link:</span> {e.synergyLink}</p>
                        </div>
                      </details>
                    ))}
                  </div>
                </>
              )}

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleSave} className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500"><Save size={16} /> Save to Master Framework</button>
                <button onClick={dlTxt} className="flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-600/10 px-5 py-2.5 text-sm font-medium text-emerald-400 hover:bg-emerald-600/20"><Download size={16} /> Download Text Report</button>
                <button onClick={dlXlsx} className="flex items-center gap-2 rounded-lg border border-blue-600/50 bg-blue-600/10 px-5 py-2.5 text-sm font-medium text-blue-400 hover:bg-blue-600/20"><Download size={16} /> Download Excel (2 Sheets)</button>
                <button onClick={startOver} className="flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm text-zinc-400 hover:border-red-700/50 hover:text-red-400"><Trash2 size={16} /> Start Over</button>
              </div>
            </div>
          )}
        </div>
      )}
    </StepShell>
  );
}
