"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Loader2, AlertTriangle, AlertCircle, CheckCircle2,
  RefreshCw, Save, Percent, Building2, Plus, Trash2,
  Download as ImportIcon, BarChart3, TrendingUp, Shield, SlidersHorizontal,
} from "lucide-react";
import StepShell from "./StepShell";
import { useCFP } from "@/context/CFPContext";
import {
  fullWACCCalculation, calcWeightedBeta, detectConglomerate,
} from "@/lib/wacc-math";
import { inferTickerFromCompanyName, normalizeTickerInput } from "@/lib/ticker-lookup";
import { buildWaccSegmentsFromCFP } from "@/lib/wacc-handoff";
import { buildDcfValuation } from "@/lib/dcf-valuation";
import {
  buildStep5AssumptionRows,
  buildStep5ReviewWarningRows,
  getStep5StructuredResults,
} from "@/lib/aggregate-forecast";
import type {
  WACCDataResponse, WACCSegmentRow, WACCConstants, BusinessType, WACCCalculation,
} from "@/types/wacc";

// =============================================================================
// Helpers
// =============================================================================
function uid(): string { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function pct(v: number, d = 2): string { return (v * 100).toFixed(d) + "%"; }
function fmtB(v: number): string {
  if (v >= 1e12) return `$${(v / 1e12).toFixed(2)}T`;
  if (v >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  return `$${v.toLocaleString()}`;
}
function fmtM(v: number): string { return `$${v.toLocaleString(undefined, { maximumFractionDigits: 1 })}M`; }
function fmtPct(v: number): string { return `${(v * 100).toFixed(1)}%`; }
function fmtUpside(v: number | null): string {
  if (v === null) return "N/A";
  return `${v > 0 ? "+" : ""}${v.toFixed(1)}%`;
}

// =============================================================================
// Component
// =============================================================================
export default function Step7WACC() {
  const { state, dispatch } = useCFP();
  const companyName = state.profile.companyName || "";
  const initialTicker = useMemo(
    () => normalizeTickerInput(state.profile.ticker) || inferTickerFromCompanyName(companyName),
    [companyName, state.profile.ticker],
  );
  const [tickerInput, setTickerInput] = useState(initialTicker);
  const activeTicker = normalizeTickerInput(tickerInput);
  const hasTicker = activeTicker.length > 0;

  // ---- Fetched data ----
  const [fetchedData, setFetchedData] = useState<WACCDataResponse | null>(state.wacc.fetchedData);
  const [isFetching, setIsFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // ---- Constants ----
  const [constants, setConstants] = useState<WACCConstants>(state.wacc.constants);

  // ---- Business type ----
  const [businessType, setBusinessType] = useState<BusinessType>(state.wacc.businessType);
  const [singleBeta, setSingleBeta] = useState(state.wacc.singleBeta);
  const [segments, setSegments] = useState<WACCSegmentRow[]>(state.wacc.segments);
  const [showValuationDashboard, setShowValuationDashboard] = useState(false);
  const [fcfMargin, setFcfMargin] = useState(0.25);
  const [terminalGrowth, setTerminalGrowth] = useState(0.025);

  // ---- Conglomerate hint ----
  const conglomerateHint = useMemo(() => {
    if (!fetchedData?.companyDescription) return null;
    const result = detectConglomerate(fetchedData.companyDescription);
    return result.isConglomerate ? result.reason : null;
  }, [fetchedData?.companyDescription]);

  // ================================================================
  // Fetch data from Yahoo Finance
  // ================================================================
  const fetchData = useCallback(async (tickerOverride?: string) => {
    const t = normalizeTickerInput(tickerOverride || tickerInput);
    if (!t) return;

    setIsFetching(true);
    setFetchError(null);

    try {
      const res = await fetch(`/api/wacc-data?ticker=${encodeURIComponent(t)}`);
      const data: WACCDataResponse = await res.json();

      if (data.error) {
        setFetchError(data.error);
      }

      setFetchedData(data);
      if (data.ticker) {
        setTickerInput(data.ticker);
        dispatch({ type: "UPDATE_PROFILE", payload: { ticker: data.ticker } });
      }

      // Auto-populate risk-free rate from the live fetch
      if (data.riskFreeRate > 0) {
        setConstants((prev) => ({ ...prev, riskFreeRate: data.riskFreeRate }));
      }
    } catch {
      setFetchError("Failed to fetch market data.");
    } finally {
      setIsFetching(false);
    }
  }, [dispatch, tickerInput]);

  // Auto-fetch on mount if ticker exists
  useEffect(() => {
    if (hasTicker && !fetchedData) {
      fetchData(activeTicker);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!tickerInput && initialTicker) {
      setTickerInput(initialTicker);
      dispatch({ type: "UPDATE_PROFILE", payload: { ticker: initialTicker } });
    }
  }, [dispatch, initialTicker, tickerInput]);

  // ================================================================
  // Segment management
  // ================================================================
  const addSegment = () => {
    setSegments((prev) => [...prev, { id: uid(), name: "", unleveredBeta: 1.0, estimatedValue: 0 }]);
  };

  const removeSegment = (id: string) => {
    setSegments((prev) => prev.filter((s) => s.id !== id));
  };

  const updateSegment = (id: string, field: keyof WACCSegmentRow, value: string | number) => {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, [field]: value } : s)));
  };

  // Import segments from CFP architecture + forecast
  const importFromCFP = () => {
    if (!state.profile.architectureJson?.architecture.length) return;

    setSegments(buildWaccSegmentsFromCFP(state.profile.architectureJson, state.forecast, uid));
  };

  const hasArchitecture = !!state.profile.architectureJson?.architecture?.length;

  // ================================================================
  // Live calculation
  // ================================================================
  const weightedBeta = useMemo(() => calcWeightedBeta(segments), [segments]);

  const effectiveBeta = businessType === "single" ? singleBeta : weightedBeta;

  const calculation: WACCCalculation | null = useMemo(() => {
    if (!fetchedData || fetchedData.marketCap <= 0) return null;
    return fullWACCCalculation({
      marketCap: fetchedData.marketCap,
      totalDebt: fetchedData.totalDebt,
      interestExpense: fetchedData.interestExpense,
      unleveredBeta: effectiveBeta,
      constants,
    });
  }, [fetchedData, effectiveBeta, constants]);
  const valuation = useMemo(
    () =>
      buildDcfValuation({
        forecast: state.forecast,
        wacc: {
          fetchedData,
          constants,
          businessType,
          singleBeta,
          segments,
          calculation,
          saved: state.wacc.saved,
        },
        fcfMargin,
        terminalGrowth,
      }),
    [businessType, calculation, constants, fcfMargin, fetchedData, segments, singleBeta, state.forecast, state.wacc.saved, terminalGrowth],
  );
  const step5Artifacts = useMemo(() => getStep5StructuredResults(state.forecast), [state.forecast]);
  const assumptionRows = useMemo(() => buildStep5AssumptionRows(state.forecast), [state.forecast]);
  const reviewWarnings = useMemo(() => buildStep5ReviewWarningRows(state.forecast), [state.forecast]);

  // ================================================================
  // Save
  // ================================================================
  const handleSave = () => {
    if (activeTicker) {
      dispatch({ type: "UPDATE_PROFILE", payload: { ticker: activeTicker } });
    }
    dispatch({
      type: "SET_WACC",
      payload: {
        fetchedData,
        constants,
        businessType,
        singleBeta,
        segments,
        calculation,
        saved: true,
      },
    });
  };
  const handleComplete = () => {
    if (!calculation) return;
    if (!state.wacc.saved) {
      handleSave();
    }
    setShowValuationDashboard(true);
  };
  const handleNext = () => {
    if (!calculation) return;
    handleSave();
    dispatch({ type: "NEXT_STEP" });
  };

  // ==========================================================================
  // Render
  // ==========================================================================
  return (
    <StepShell
      stepNumber={7}
      title="Discount Rate (WACC)"
      subtitle="Calculate the Weighted Average Cost of Capital using Damodaran's re-levered beta methodology."
      onNext={handleNext}
      nextDisabled={!calculation}
      onComplete={handleComplete}
      completeDisabled={!calculation}
      completeLabel={showValuationDashboard ? "Refresh Dashboard" : "Complete"}
    >
      <div className="space-y-6">
        {showValuationDashboard && (
          <section className="space-y-5 rounded-xl border border-emerald-700/40 bg-emerald-950/10 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-300">
                  <Shield size={16} /> Final Valuation Dashboard
                </h3>
                <p className="mt-1 text-xs text-zinc-400">
                  Illustrative DCF bridge using Step 5 annual forecast, Step 7 WACC, and editable cash-flow assumptions.
                </p>
              </div>
              <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
                valuation.impliedUpsidePct !== null && valuation.impliedUpsidePct >= 0
                  ? "bg-emerald-500/15 text-emerald-300"
                  : "bg-amber-500/15 text-amber-300"
              }`}>
                vs Market Cap {fmtUpside(valuation.impliedUpsidePct)}
              </span>
            </div>

            {!valuation.hasInputs ? (
              <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-200">
                {valuation.warnings.join(" ")}
              </div>
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-4">
                  <DashboardCard label="DCF Equity Value" value={fmtM(valuation.equityValueUsdM)} highlight />
                  <DashboardCard label="Enterprise Value" value={fmtM(valuation.enterpriseValueUsdM)} />
                  <DashboardCard label="Market Cap" value={valuation.marketCapUsdM ? fmtM(valuation.marketCapUsdM) : "N/A"} />
                  <DashboardCard label="WACC" value={valuation.wacc ? fmtPct(valuation.wacc) : "N/A"} />
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
                  <div className="overflow-x-auto rounded-lg border border-zinc-800">
                    <table className="w-full text-xs">
                      <thead className="bg-zinc-800 text-zinc-400">
                        <tr>
                          <th className="px-3 py-2 text-left font-medium">Year</th>
                          <th className="px-3 py-2 text-right font-medium">Revenue</th>
                          <th className="px-3 py-2 text-right font-medium">FCFF</th>
                          <th className="px-3 py-2 text-right font-medium">Discount</th>
                          <th className="px-3 py-2 text-right font-medium">PV</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-800/60">
                        {valuation.forecastRows.map((row) => (
                          <tr key={row.year}>
                            <td className="px-3 py-2 text-zinc-300">FY{row.year}</td>
                            <td className="px-3 py-2 text-right font-mono text-zinc-300">{fmtM(row.revenueUsdM)}</td>
                            <td className="px-3 py-2 text-right font-mono text-zinc-300">{fmtM(row.fcffUsdM)}</td>
                            <td className="px-3 py-2 text-right font-mono text-zinc-400">{row.discountFactor.toFixed(3)}</td>
                            <td className="px-3 py-2 text-right font-mono text-zinc-100">{fmtM(row.presentValueUsdM)}</td>
                          </tr>
                        ))}
                        <tr className="bg-zinc-900/60">
                          <td className="px-3 py-2 font-semibold text-zinc-200">Terminal PV</td>
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2" />
                          <td className="px-3 py-2 text-right font-mono text-zinc-400">
                            TV {fmtM(valuation.terminalValueUsdM)}
                          </td>
                          <td className="px-3 py-2 text-right font-mono font-semibold text-zinc-100">
                            {fmtM(valuation.terminalPresentValueUsdM)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <h4 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-blue-300">
                      <SlidersHorizontal size={15} /> Key Assumptions
                    </h4>
                    <AssumptionSlider
                      label="FCF Margin"
                      value={fcfMargin}
                      min={0.15}
                      max={0.35}
                      step={0.005}
                      onChange={setFcfMargin}
                    />
                    <AssumptionSlider
                      label="Terminal Growth"
                      value={terminalGrowth}
                      min={0.01}
                      max={0.04}
                      step={0.001}
                      onChange={setTerminalGrowth}
                    />
                    <div className="rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
                      Net debt bridge: {fmtM(valuation.netDebtUsdM)}. Positive means debt exceeds fetched cash.
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 lg:grid-cols-3">
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Market Sanity Check</h4>
                    <p className="mt-2 text-sm text-zinc-300">
                      Current external consensus for AAPL is roughly $299-$303 average target, with high targets around $350.
                    </p>
                    <p className="mt-2 text-xs text-zinc-500">
                      Use this as a market cross-check, not as an input to the DCF.
                    </p>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Top Model Drivers</h4>
                    <ul className="mt-2 space-y-1.5 text-xs text-zinc-300">
                      {assumptionRows.slice(0, 4).map((row) => (
                        <li key={`${row.segment}-${row.assumption_id}`}>
                          <span className="font-mono text-blue-300">{row.assumption_id}</span>{" "}
                          <span className="text-zinc-500">{row.driver_quality}</span> {row.statement}
                        </li>
                      ))}
                    </ul>
                  </div>
                  <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4">
                    <h4 className="text-xs font-semibold uppercase tracking-wider text-amber-300">Audit Flags</h4>
                    {reviewWarnings.length > 0 ? (
                      <ul className="mt-2 space-y-1.5 text-xs text-amber-100">
                        {reviewWarnings.slice(0, 4).map((row, index) => (
                          <li key={`${row.audit_flag}-${index}`}>
                            <span className="font-mono text-amber-300">{row.audit_flag}</span> {row.warning}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="mt-2 text-xs text-zinc-500">No Step 5 review warnings.</p>
                    )}
                  </div>
                </div>

                {valuation.warnings.length > 0 && (
                  <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-200">
                    {valuation.warnings.join(" ")}
                  </div>
                )}
                {step5Artifacts.length === 0 && (
                  <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-xs text-amber-200">
                    Step 5 structured artifact is missing; dashboard quality is limited.
                  </div>
                )}
              </>
            )}
          </section>
        )}

        {/* ===== SECTION A: Data Fetch ===== */}
        <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">
              <BarChart3 size={16} /> Market Data
            </h3>
            {fetchedData && (
              <span className="text-xs text-zinc-500">{fetchedData.companyName}</span>
            )}
          </div>

          {!hasTicker && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-sm text-amber-300">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              No ticker is saved yet. Enter one below to continue, then save WACC to persist it.
            </div>
          )}

          <div className="flex items-end gap-3">
            <div className="flex-1">
              <label className="mb-1 block text-xs text-zinc-500">Ticker Symbol</label>
              <input
                type="text"
                value={tickerInput}
                onChange={(event) => setTickerInput(event.target.value.toUpperCase())}
                placeholder={companyName ? `Ticker for ${companyName}` : "AAPL"}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
              />
            </div>
            <button
              onClick={() => fetchData(activeTicker)}
              disabled={isFetching || !hasTicker}
              className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
            >
              {isFetching ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
              {fetchedData ? "Refetch" : "Fetch Data"}
            </button>
          </div>

          {fetchError && (
            <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-xs text-red-300">
              <AlertCircle size={14} className="mt-0.5 shrink-0" /> {fetchError}
            </div>
          )}

          {fetchedData && !fetchError && (
            <div className="grid gap-3 sm:grid-cols-3">
              <DataCard label="Market Cap" value={fmtB(fetchedData.marketCap)} />
              <DataCard label="Total Debt" value={fmtB(fetchedData.totalDebt)} />
              <DataCard label="Interest Expense" value={fmtB(fetchedData.interestExpense)} />
            </div>
          )}
        </section>

        {/* ===== SECTION B: Editable Constants ===== */}
        <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            <Percent size={16} /> Model Constants
          </h3>
          <div className="grid gap-4 sm:grid-cols-3">
            <ConstantInput
              label="Risk-Free Rate (%)"
              value={constants.riskFreeRate * 100}
              onChange={(v) => setConstants((p) => ({ ...p, riskFreeRate: v / 100 }))}
              hint="10Y Treasury (^TNX)"
            />
            <ConstantInput
              label="Implied ERP (%)"
              value={constants.impliedERP * 100}
              onChange={(v) => setConstants((p) => ({ ...p, impliedERP: v / 100 }))}
              hint="Damodaran implied"
            />
            <ConstantInput
              label="Marginal Tax Rate (%)"
              value={constants.marginalTaxRate * 100}
              onChange={(v) => setConstants((p) => ({ ...p, marginalTaxRate: v / 100 }))}
              hint="US corporate rate"
            />
          </div>
        </section>

        {/* ===== SECTION C: Business Type & Beta ===== */}
        <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-4">
          <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">
            <Building2 size={16} /> Beta Configuration
          </h3>

          {/* Toggle */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => setBusinessType("single")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${businessType === "single" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
            >
              Single Business
            </button>
            <button
              onClick={() => setBusinessType("conglomerate")}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${businessType === "conglomerate" ? "bg-blue-600 text-white" : "bg-zinc-800 text-zinc-400 hover:bg-zinc-700"}`}
            >
              Conglomerate
            </button>
          </div>

          {/* Conglomerate hint */}
          {conglomerateHint && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/30 p-3 text-xs text-amber-300">
              <AlertTriangle size={14} className="mt-0.5 shrink-0" />
              Suggestion: This company appears to be a Conglomerate. {conglomerateHint}
            </div>
          )}

          {/* Single beta */}
          {businessType === "single" && (
            <div className="max-w-xs">
              <label className="mb-1 block text-xs text-zinc-500">Industry Unlevered Beta</label>
              <input
                type="number"
                step="0.01"
                value={singleBeta}
                onChange={(e) => setSingleBeta(Number(e.target.value))}
                className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
              />
            </div>
          )}

          {/* Conglomerate segments */}
          {businessType === "conglomerate" && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                {hasArchitecture && (
                  <button
                    onClick={importFromCFP}
                    className="flex items-center gap-1.5 rounded-lg border border-blue-600/50 bg-blue-600/10 px-3 py-1.5 text-xs font-medium text-blue-400 hover:bg-blue-600/20"
                  >
                    <ImportIcon size={12} /> Import Segments from CFP
                  </button>
                )}
                <button
                  onClick={addSegment}
                  className="flex items-center gap-1.5 rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-800"
                >
                  <Plus size={12} /> Add Segment
                </button>
              </div>

              {segments.length > 0 && (
                <div className="overflow-x-auto rounded-lg border border-zinc-800">
                  <table className="w-full text-xs">
                    <thead className="bg-zinc-800 text-zinc-400">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Segment Name</th>
                        <th className="px-3 py-2 text-right font-medium">Unlevered Beta</th>
                        <th className="px-3 py-2 text-right font-medium">Est. Value ($M)</th>
                        <th className="px-3 py-2 w-10" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                      {segments.map((seg) => (
                        <tr key={seg.id} className="hover:bg-zinc-900/30">
                          <td className="px-2 py-1">
                            <input
                              type="text"
                              value={seg.name}
                              onChange={(e) => updateSegment(seg.id, "name", e.target.value)}
                              className="w-full rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-blue-500"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              step="0.01"
                              value={seg.unleveredBeta}
                              onChange={(e) => updateSegment(seg.id, "unleveredBeta", Number(e.target.value))}
                              className="w-24 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-right text-xs text-zinc-100 outline-none focus:border-blue-500"
                            />
                          </td>
                          <td className="px-2 py-1">
                            <input
                              type="number"
                              step="1"
                              value={seg.estimatedValue}
                              onChange={(e) => updateSegment(seg.id, "estimatedValue", Number(e.target.value))}
                              className="w-28 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-right text-xs text-zinc-100 outline-none focus:border-blue-500"
                            />
                          </td>
                          <td className="px-2 py-1 text-center">
                            <button onClick={() => removeSegment(seg.id)} className="text-zinc-600 hover:text-red-400">
                              <Trash2 size={12} />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-zinc-900/60">
                      <tr>
                        <td className="px-3 py-2 text-xs font-semibold text-zinc-300">Weighted Average</td>
                        <td className="px-3 py-2 text-right font-mono text-xs font-bold text-blue-400">{weightedBeta.toFixed(3)}</td>
                        <td className="px-3 py-2 text-right font-mono text-xs text-zinc-500">
                          {segments.reduce((s, seg) => s + seg.estimatedValue, 0).toLocaleString()}
                        </td>
                        <td />
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        {/* ===== SECTION D: Live Calculation Dashboard ===== */}
        {calculation && (
          <section className="rounded-xl border border-zinc-700 bg-zinc-900/80 p-5 space-y-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-zinc-400">
              <TrendingUp size={16} /> WACC Calculation
            </h3>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <CalcCard label="D/E Ratio" value={calculation.deRatio.toFixed(3)} />
              <CalcCard label="Unlevered Beta" value={calculation.unleveredBeta.toFixed(3)} />
              <CalcCard label="Re-levered Beta" value={calculation.releveredBeta.toFixed(3)} highlight />
              <CalcCard label="Cost of Equity" value={pct(calculation.costOfEquity)} />
              <CalcCard label="Pre-Tax Cost of Debt" value={pct(calculation.preTaxCostOfDebt)} />
              <CalcCard label="After-Tax Cost of Debt" value={pct(calculation.afterTaxCostOfDebt)} />
              <CalcCard label="Weight of Equity" value={pct(calculation.weightEquity, 1)} />
              <CalcCard label="Weight of Debt" value={pct(calculation.weightDebt, 1)} />
            </div>

            {/* Final WACC — prominent */}
            <div className="rounded-xl border-2 border-emerald-500/30 bg-emerald-950/20 p-6 text-center">
              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Final WACC</p>
              <p className="mt-2 text-4xl font-bold tabular-nums text-emerald-400">
                {pct(calculation.wacc)}
              </p>
              <p className="mt-1 text-xs text-zinc-500">
                = ({pct(calculation.weightEquity, 1)} Equity &times; {pct(calculation.costOfEquity)} Ke)
                + ({pct(calculation.weightDebt, 1)} Debt &times; {pct(calculation.afterTaxCostOfDebt)} Kd)
              </p>
            </div>
          </section>
        )}

        {/* ===== SECTION E: Actions ===== */}
        {calculation && (
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={handleSave}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-500"
            >
              <Save size={16} /> Save to Master Framework
            </button>

            <div className="flex items-center gap-2 text-xs text-zinc-500">
              <CheckCircle2 size={14} className="text-emerald-500" />
              WACC: {pct(calculation.wacc)} ready for DCF valuation
            </div>
          </div>
        )}
      </div>
    </StepShell>
  );
}

// =============================================================================
// Sub-components
// =============================================================================

function DataCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-zinc-950 px-3 py-2">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-zinc-200">{value}</p>
    </div>
  );
}

function ConstantInput({ label, value, onChange, hint }: {
  label: string; value: number; onChange: (v: number) => void; hint: string;
}) {
  // Round to avoid floating-point precision drift (e.g., 0.0428*100 = 4.2799999...)
  const displayValue = Math.round(value * 100) / 100;
  return (
    <div>
      <label className="mb-1 block text-xs text-zinc-500">{label}</label>
      <input
        type="number"
        step="0.01"
        value={displayValue}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-blue-500"
      />
      <p className="mt-1 text-xs text-zinc-600">{hint}</p>
    </div>
  );
}

function CalcCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? "bg-blue-950/30 border border-blue-700/30" : "bg-zinc-950"}`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-sm font-mono font-semibold ${highlight ? "text-blue-400" : "text-zinc-200"}`}>{value}</p>
    </div>
  );
}

function DashboardCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2 ${highlight ? "border border-emerald-700/30 bg-emerald-950/30" : "bg-zinc-950"}`}>
      <p className="text-xs text-zinc-500">{label}</p>
      <p className={`mt-0.5 text-sm font-mono font-semibold ${highlight ? "text-emerald-300" : "text-zinc-200"}`}>
        {value}
      </p>
    </div>
  );
}

function AssumptionSlider({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-zinc-500">{label}</span>
        <span className="font-mono text-zinc-200">{fmtPct(value)}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="w-full accent-blue-500"
      />
    </label>
  );
}
