"use client";

import { useState, useMemo, useCallback } from "react";
import {
  Loader2, Download, AlertTriangle, AlertCircle, CheckCircle2,
  TrendingUp, Flame, Shield, BarChart3, FileSpreadsheet, CalendarClock,
} from "lucide-react";
import * as XLSX from "xlsx";
import StepShell from "./StepShell";
import { useSettings } from "@/context/SettingsContext";
import EarningsDatePicker from "@/components/ui/EarningsDatePicker";
import { useCFP } from "@/context/CFPContext";
import {
  aggregateMasterForecast,
  buildStep5AssumptionRows,
  buildStep5ReviewWarningRows,
  buildStep5WeakSensitivityRows,
  getStep5StructuredResults,
} from "@/lib/aggregate-forecast";
import type { AggregatedRow, SummaryInsights, GenerateSummaryResponse } from "@/types/cfp";

// =============================================================================
// Helpers
// =============================================================================
function dateSuffix() { const n = new Date(); return `${String(n.getMonth()+1).padStart(2,"0")}-${String(n.getDate()).padStart(2,"0")}-${n.getFullYear()}`; }
function sName(c: string) { return (c||"company").replace(/[^a-zA-Z0-9_-]/g,"_").toLowerCase(); }
function fmt(v: number) { return v.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 1 }); }
function cagrColor(c: number) { return c >= 15 ? "text-emerald-400" : c >= 5 ? "text-emerald-300" : c >= 0 ? "text-zinc-300" : "text-red-400"; }
function pct(v: number) { return `${v.toFixed(1)}%`; }

// =============================================================================
// Component
// =============================================================================
export default function Step6Summary() {
  const { state, dispatch } = useCFP();
  const structuredResults = useMemo(() => getStep5StructuredResults(state.forecast), [state.forecast]);
  const hasStructuredArtifact = structuredResults.length > 0;
  const hasForecast = state.forecast.approved && (state.forecast.segments.length > 0 || hasStructuredArtifact);
  const assumptionRows = useMemo(() => buildStep5AssumptionRows(state.forecast), [state.forecast]);
  const weakSensitivityRows = useMemo(() => buildStep5WeakSensitivityRows(state.forecast), [state.forecast]);
  const reviewWarningRows = useMemo(() => buildStep5ReviewWarningRows(state.forecast), [state.forecast]);
  const confidence = structuredResults[0]?.machine_artifact.confidence_summary ?? null;

  // ---- Aggregation (runs immediately on load if data exists) ----
  const rows: AggregatedRow[] = useMemo(() => {
    if (!hasForecast) return [];
    return aggregateMasterForecast(state.forecast);
  }, [hasForecast, state.forecast]);

  // ---- Settings (centralized API key) ----
  const { settings, activeApiKey } = useSettings();

  // ---- AI insights ----
  const [insights, setInsights] = useState<SummaryInsights | null>(state.summary.insights);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ---- Expiration / earnings date ----
  const [expirationDate, setExpirationDate] = useState<Date | null>(null);

  // ---- Generate insights ----
  const handleGenerateInsights = useCallback(async () => {
    setErrorMsg(null); setIsLoading(true);
    try {
      const res = await fetch("/api/generate-summary", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          aggregatedTableData: rows,
          step5ForecastArtifacts: structuredResults,
          step5ReviewWarnings: reviewWarningRows,
          step3Competition: state.competition,
          step4Complete: state.synergies,
          apiKey: activeApiKey,
          llmProvider: settings.llmProvider,
        }),
      });
      const d: GenerateSummaryResponse = await res.json();
      if (!res.ok) { if (d.requiresApiKey) throw new Error("No API key configured. Open Settings (gear icon) to add your key."); throw new Error(d.error); }
      setInsights(d.insights);
    } catch (e: unknown) { setErrorMsg(e instanceof Error ? e.message : "Failed."); }
    finally { setIsLoading(false); }
  }, [rows, structuredResults, reviewWarningRows, state.competition, state.synergies, activeApiKey, settings.llmProvider]);

  // ---- Save to context ----
  const handleSave = () => {
    dispatch({ type: "SET_SUMMARY", payload: { aggregatedRows: rows, insights } });
  };

  // ---- Master Excel export (3+ sheets) ----
  const handleExport = () => {
    const wb = XLSX.utils.book_new();

    // Sheet 1: Annual consolidated forecast
    const execRows: Record<string, unknown>[] = rows.map(r => ({
      Segment: r.segment || (r.isTotal ? "" : ""),
      Category: r.category,
      "FY1 ($M)": r.fy1,
      "FY2 ($M)": r.fy2,
      "FY3 ($M)": r.fy3,
      "FY4 ($M)": r.fy4,
      "FY5 ($M)": r.fy5,
      "5Y CAGR (%)": r.cagr,
    }));
    // Append insights if available
    if (insights) {
      execRows.push({});
      execRows.push({ Segment: "TOP GROWTH ENGINES" });
      for (const eng of insights.topEngines) {
        execRows.push({ Segment: eng.name, Category: eng.cagr, "FY1 ($M)": eng.explanation });
      }
      execRows.push({});
      execRows.push({ Segment: "REVENUE SHIFT", Category: insights.conclusion.revenueShift });
      execRows.push({ Segment: "ECOSYSTEM RESILIENCE", Category: insights.conclusion.ecosystemResilience });
    }
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(execRows), "Annual Consolidated");

    // Sheet 2: Segment-level source-of-truth forecast table from Step 5 v5.5
    const segmentForecastRows = structuredResults.flatMap((result) =>
      result.machine_artifact.forecast_table.map((row) => ({
        Segment: row.segment,
        Category: row.category,
        Product: row.product ?? "",
        "Fiscal Year": row.fiscal_year,
        Quarter: row.quarter ?? "",
        "Revenue Low ($M)": row.revenue_low_usd_m,
        "Revenue Base ($M)": row.revenue_base_usd_m,
        "Revenue High ($M)": row.revenue_high_usd_m,
        "YoY Growth (%)": row.yoy_growth_pct,
        "Assumption IDs": row.assumption_ids.join(", "),
        "Driver Quality": row.driver_quality,
        Flags: row.flags.join(", "),
      })),
    );
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(segmentForecastRows.length ? segmentForecastRows : [{ Note: "No Step 5 structured artifact rows" }]),
      "Segment Forecast",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(assumptionRows.length ? assumptionRows : [{ Note: "No assumption registry" }]),
      "Assumption Registry",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(weakSensitivityRows.length ? weakSensitivityRows : [{ Note: "No weak inference sensitivity rows" }]),
      "Weak Sensitivity",
    );

    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(reviewWarningRows.length ? reviewWarningRows : [{ Note: "No review warnings or audit flags" }]),
      "Review Warnings",
    );

    // Synergies & Capital
    const synRows = state.synergies.paths.map(p => ({
      Source: p.sourceBusiness, Capability: p.coreCapability, Recipient: p.recipientBusiness,
      Mechanism: p.mechanism, Impact: p.productImpact, "Signal Type": p.financialSignal.type,
      Flywheel: p.flywheel.isFlywheel ? "Yes" : "No", "Impact Score": p.impactScore,
    }));
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(synRows.length ? synRows : [{ Note: "No synergy data" }]), "Synergies & Capital");

    // Segment quarterly working projection from Step 5 for continuity
    for (const seg of state.forecast.segments) {
      const qRows: Record<string, unknown>[] = [];
      for (const prod of seg.products) {
        for (const q of prod.forecast) {
          qRows.push({
            Product: prod.productName, Category: prod.categoryName,
            Year: q.year, Quarter: q.quarter,
            "Revenue ($M)": q.revenueM, "YoY Growth (%)": q.yoyGrowth,
            Driver: q.strategicDriver,
          });
        }
      }
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(qRows), seg.segment.slice(0, 31));
    }

    XLSX.writeFile(wb, `${sName(state.profile.companyName)}-Master-DCF-Module-1-${dateSuffix()}.xlsx`);
  };

  // ==========================================================================
  return (
    <StepShell stepNumber={6} title="Executive Summary" subtitle="Consolidated 5-year master forecast with strategic AI insights.">
      {!hasForecast && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/30 p-4 text-sm text-amber-300">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div><p className="font-medium">Step 5 forecast not found</p><p className="mt-1 text-xs text-amber-400/70">Complete Step 5 and save the forecast to view the executive summary.</p></div>
        </div>
      )}

      {hasForecast && rows.length > 0 && (
        <div className="space-y-8">

          {/* ===== THE MASTER TABLE ===== */}
          <section>
            <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">
              <BarChart3 size={16} /> Consolidated Master Forecast
            </h3>
            {hasStructuredArtifact && (
              <div className="mb-3 rounded-lg border border-emerald-700/30 bg-emerald-950/20 px-4 py-3 text-xs text-emerald-200">
                Using Step 5 v5.5 machine artifact as the annual source of truth.
                Legacy quarterly projection is retained for audit continuity.
              </div>
            )}
            <div className="overflow-x-auto rounded-lg border border-zinc-800">
              <table className="w-full text-xs">
                <thead className="bg-zinc-800 text-zinc-400">
                  <tr>
                    <th className="px-3 py-2 text-left font-medium">Segment</th>
                    <th className="px-3 py-2 text-left font-medium">Category</th>
                    <th className="px-3 py-2 text-right font-medium">FY1 ($M)</th>
                    <th className="px-3 py-2 text-right font-medium">FY2 ($M)</th>
                    <th className="px-3 py-2 text-right font-medium">FY3 ($M)</th>
                    <th className="px-3 py-2 text-right font-medium">FY4 ($M)</th>
                    <th className="px-3 py-2 text-right font-medium">FY5 ($M)</th>
                    <th className="px-3 py-2 text-right font-medium">5Y CAGR</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                  {rows.map((r, i) => (
                    <tr key={i} className={
                      r.isTotal ? "bg-blue-950/30 font-bold" :
                      r.isSubtotal ? "bg-zinc-900/80 font-semibold" :
                      "hover:bg-zinc-900/30"
                    }>
                      <td className={`px-3 py-1.5 ${r.isTotal || r.isSubtotal ? "text-zinc-200" : "text-zinc-500"}`}>
                        {r.isTotal ? "" : r.segment}
                      </td>
                      <td className={`px-3 py-1.5 ${r.isTotal ? "text-blue-300" : r.isSubtotal ? "text-zinc-200" : "text-zinc-300"}`}>
                        {r.category}
                      </td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-200">{fmt(r.fy1)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-200">{fmt(r.fy2)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-200">{fmt(r.fy3)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-200">{fmt(r.fy4)}</td>
                      <td className="px-3 py-1.5 text-right font-mono text-zinc-200">{fmt(r.fy5)}</td>
                      <td className={`px-3 py-1.5 text-right font-mono font-semibold ${cagrColor(r.cagr)}`}>
                        {r.cagr > 0 ? "+" : ""}{r.cagr.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {hasStructuredArtifact && (
            <section className="grid gap-4 lg:grid-cols-3">
              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-blue-400">
                  <Shield size={16} /> Forecast Confidence
                </h3>
                {confidence && (
                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <div>
                      <p className="text-zinc-500">Disclosed</p>
                      <p className="font-mono text-zinc-100">{pct(confidence.disclosed_driver_revenue_pct)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Strong</p>
                      <p className="font-mono text-zinc-100">{pct(confidence.strong_driver_revenue_pct)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Weak</p>
                      <p className="font-mono text-amber-300">{pct(confidence.weak_driver_revenue_pct)}</p>
                    </div>
                    <div>
                      <p className="text-zinc-500">Flags</p>
                      <p className="font-mono text-amber-300">{confidence.high_uncertainty_flags}</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">
                  <TrendingUp size={16} /> Key Drivers
                </h3>
                <ul className="space-y-2 text-xs text-zinc-300">
                  {assumptionRows.slice(0, 5).map((row) => (
                    <li key={`${row.segment}-${row.assumption_id}`}>
                      <span className="font-mono text-blue-300">{row.assumption_id}</span>
                      <span className="text-zinc-500"> {row.driver_quality}: </span>
                      {row.statement}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-400">
                  <AlertTriangle size={16} /> Review Warnings
                </h3>
                {reviewWarningRows.length > 0 ? (
                  <ul className="space-y-2 text-xs text-amber-100">
                    {reviewWarningRows.slice(0, 5).map((row, index) => (
                      <li key={`${row.segment}-${row.audit_flag}-${index}`}>
                        <span className="font-mono text-amber-300">{row.audit_flag}</span>
                        <span className="text-zinc-500"> {row.segment}: </span>
                        {row.warning}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-zinc-500">No Step 5 review warnings or audit flags.</p>
                )}
              </div>
            </section>
          )}

          {hasStructuredArtifact && (
            <section className="rounded-lg border border-blue-700/30 bg-blue-950/20 p-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-blue-300">
                    Handoff to Step 7 WACC
                  </h3>
                  <p className="mt-1 text-xs text-blue-100/80">
                    Forecast artifacts are saved, annual consolidated revenue is available, and Step 7 can consume the validated forecast with warnings visible.
                  </p>
                </div>
                <button
                  onClick={() => dispatch({ type: "SET_STEP", payload: 7 })}
                  className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500"
                >
                  Continue to WACC
                </button>
              </div>
            </section>
          )}

          {/* ===== GENERATE INSIGHTS ===== */}
          {!insights && (
            <section className="flex flex-col items-center gap-3 py-4">
              {errorMsg && <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300"><AlertCircle size={16} className="mt-0.5 shrink-0" /> {errorMsg}</div>}
              <button onClick={handleGenerateInsights} disabled={isLoading}
                className="flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500">
                {isLoading ? <><Loader2 size={18} className="animate-spin" /> Analyzing...</> : <><TrendingUp size={16} /> Generate Strategic Insights</>}
              </button>
            </section>
          )}

          {/* ===== AI NARRATIVE ===== */}
          {insights && (
            <section className="space-y-6">
              {/* Top 3 Growth Engines */}
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-400">
                  <Flame size={16} /> Strategic Growth Heatmap — Top 3 Engines
                </h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  {insights.topEngines.map((eng, i) => (
                    <div key={i} className="rounded-lg border border-amber-700/30 bg-amber-950/20 p-4">
                      <div className="flex items-start justify-between">
                        <span className="text-sm font-semibold text-amber-300">#{i + 1}</span>
                        <span className="rounded-full bg-amber-600/20 px-2 py-0.5 text-xs font-bold text-amber-400">{eng.cagr}</span>
                      </div>
                      <p className="mt-1 text-sm font-medium text-zinc-200">{eng.name}</p>
                      <p className="mt-1.5 text-xs text-zinc-400">{eng.explanation}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Conclusion */}
              <div>
                <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-blue-400">
                  <Shield size={16} /> Summary Conclusion
                </h3>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border border-blue-700/30 bg-blue-950/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-blue-400">Revenue Shift</p>
                    <p className="mt-2 text-sm text-zinc-300">{insights.conclusion.revenueShift}</p>
                  </div>
                  <div className="rounded-lg border border-emerald-700/30 bg-emerald-950/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Ecosystem Resilience</p>
                    <p className="mt-2 text-sm text-zinc-300">{insights.conclusion.ecosystemResilience}</p>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* ===== EXPIRATION CALENDAR ===== */}
          <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-4">
            <div className="flex items-center gap-2">
              <CalendarClock size={18} className="text-blue-400" />
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-300">
                Model Expiration Date
              </h3>
            </div>
            <p className="text-xs text-zinc-500">
              Set the expiration for this model. The next earnings date is highlighted in red to help you
              choose when to refresh the analysis.
            </p>
            <div className="max-w-sm">
              <EarningsDatePicker
                companyName={state.profile.companyName}
                selected={expirationDate}
                onChange={(d) => setExpirationDate(d)}
                label="Expiration Date"
              />
            </div>
            {expirationDate && (
              <p className="text-xs text-emerald-400">
                Model expires: {expirationDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              </p>
            )}
          </section>

          {/* ===== FINAL ACTIONS ===== */}
          <section className="space-y-3 pt-2">
            <div className="flex items-center gap-2 text-emerald-400">
              <CheckCircle2 size={20} />
              <span className="text-sm font-medium">Module 1 Complete — Ready for Export</span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              {insights && (
                <button onClick={handleSave}
                  className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500">
                  <CheckCircle2 size={16} /> Save Summary to Framework
                </button>
              )}

              <button onClick={handleExport}
                className="flex items-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-bold text-white hover:bg-emerald-500 shadow-lg shadow-emerald-600/20">
                <FileSpreadsheet size={18} />
                Export Complete Model (Executive Format)
              </button>

              <button onClick={handleExport}
                className="flex items-center gap-2 rounded-lg border border-blue-600/50 bg-blue-600/10 px-5 py-2.5 text-sm font-medium text-blue-400 hover:bg-blue-600/20">
                <Download size={16} /> Download .xlsx
              </button>
            </div>
          </section>
        </div>
      )}
    </StepShell>
  );
}
