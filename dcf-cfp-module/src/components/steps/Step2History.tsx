"use client";

import { useState, useCallback, useMemo } from "react";
import {
  Loader2,
  Download,
  Trash2,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  Plus,
} from "lucide-react";
import * as XLSX from "xlsx";
import StepShell from "./StepShell";
import { useCFP } from "@/context/CFPContext";
import { mergeHistoryYears } from "@/lib/step2-baseline";
import type { HistoricalExtractionRow, ExtractHistoryResponse } from "@/types/cfp";

// =============================================================================
// Constants
// =============================================================================
const MAX_YEARS = 5;

function uid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function formatNullableMetric(value: number | null): string {
  if (value === null) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
}

function parseNullableMetric(value: string): number | null {
  if (value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

type Step2StructuredResultForReview = NonNullable<ExtractHistoryResponse["structuredResult"]>;

// =============================================================================
// Step 2 — Historical Financials
// =============================================================================
export default function Step2History() {
  const { state, dispatch } = useCFP();

  const step1Input = state.profile.step1StructuredResult ?? state.profile.architectureJson;
  const hasArchitecture = !!step1Input;

  // ── Extraction state ─────────────────────────────────────────────────────────
  const [isExtracting, setIsExtracting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // ── Staging rows (editable before confirming to master) ──────────────────────
  const [stagingRows, setStagingRows] = useState<HistoricalExtractionRow[]>([]);
  const [stagingYears, setStagingYears] = useState<number[]>([]);
  const [structuredResults, setStructuredResults] = useState<Step2StructuredResultForReview[]>([]);

  // ── Master history from context ──────────────────────────────────────────────
  const masterRows = state.history.rows;
  const confirmedYears = state.history.confirmedYears;
  const canAddMoreYears = confirmedYears.length < MAX_YEARS;

  const hasStagingData = stagingRows.length > 0;
  const ticker = state.profile.ticker.trim().toUpperCase();

  // Group master rows by segment for the read-only accordion
  const groupedMaster = useMemo(() => {
    const groups: Record<string, HistoricalExtractionRow[]> = {};
    const sorted = [...masterRows].sort((a, b) => {
      if (a.segment !== b.segment) return a.segment.localeCompare(b.segment);
      if (a.fiscalYear !== b.fiscalYear) return a.fiscalYear - b.fiscalYear;
      return a.quarter.localeCompare(b.quarter);
    });
    for (const row of sorted) {
      const key = row.segment || "Unassigned";
      if (!groups[key]) groups[key] = [];
      groups[key].push(row);
    }
    return groups;
  }, [masterRows]);

  // ============================================================================
  // Extract handler — GET /api/yahoo-history
  // ============================================================================
  const handleExtract = useCallback(async () => {
    if (!ticker) {
      setErrorMsg("Step 1 did not save a ticker. Re-run Step 1 with a public ticker such as AAPL.");
      return;
    }
    if (!canAddMoreYears) {
      setErrorMsg(`Maximum of ${MAX_YEARS} distinct years reached. Remove history to refresh the baseline.`);
      return;
    }

    setErrorMsg(null);
    setIsExtracting(true);
    setStagingRows([]);
    setStagingYears([]);
    setStructuredResults([]);

    try {
      const params = new URLSearchParams({
        ticker,
        companyName: state.profile.companyName || ticker,
      });
      const res = await fetch(`/api/yahoo-history?${params.toString()}`);
      const data: ExtractHistoryResponse = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? `Yahoo Finance history request failed (${res.status}).`);
      }

      const freshRows = data.rows.filter((row) => !confirmedYears.includes(row.fiscalYear));
      if (freshRows.length === 0) {
        throw new Error("Yahoo Finance returned no new fiscal years to add.");
      }
      const selectedYears = Array.from(new Set(freshRows.map((row) => row.fiscalYear)))
        .sort((a, b) => a - b)
        .slice(-MAX_YEARS + confirmedYears.length);
      const selectedYearSet = new Set(selectedYears);
      const nextRows = freshRows
        .filter((row) => selectedYearSet.has(row.fiscalYear))
        .map((row) => ({ ...row, id: uid(), yoyGrowth: 0 }));
      const nextStructuredResults =
        data.structuredResults?.filter((result) => selectedYearSet.has(result.target_year)) ??
        (data.structuredResult ? [data.structuredResult] : []);

      setStagingRows(nextRows);
      setStagingYears(selectedYears);
      setStructuredResults(nextStructuredResults);
    } catch (err: unknown) {
      setErrorMsg(err instanceof Error ? err.message : "Extraction failed.");
    } finally {
      setIsExtracting(false);
    }
  }, [canAddMoreYears, confirmedYears, state.profile.companyName, ticker]);

  // ── Staging: edit a cell ─────────────────────────────────────────────────────
  const updateStagingCell = (
    id: string,
    field: keyof HistoricalExtractionRow,
    value: string | number | null,
  ) => {
    setStagingRows((prev) =>
      prev.map((row) => (row.id === id ? { ...row, [field]: value } : row)),
    );
  };

  // ── Confirm staging → append to master ──────────────────────────────────────
  const handleConfirm = () => {
    if (stagingRows.length === 0) return;
    dispatch({
      type: "SET_HISTORY",
      payload: {
        rows: [...masterRows, ...stagingRows],
        confirmedYears: mergeHistoryYears(confirmedYears, stagingYears),
        structuredResults: [
          ...(state.history.structuredResults ?? []),
          ...structuredResults,
        ],
      },
    });
    setStagingRows([]);
    setStagingYears([]);
    setStructuredResults([]);
  };

  // ── Excel download ───────────────────────────────────────────────────────────
  const handleExcelDownload = () => {
    if (masterRows.length === 0) return;
    const exportData = masterRows.map((row) => ({
      fiscalYear: row.fiscalYear,
      quarter: row.quarter,
      segment: row.segment,
      productCategory: row.productCategory,
      productName: row.productName,
      revenue: row.revenue,
      yoyGrowth: row.yoyGrowth,
      operatingIncome: row.operatingIncome,
      notes: row.notes,
      reviewStatus: row.reviewStatus,
      internalVerify: row.internalVerify,
      sourceType: row.sourceType,
      sourceName: row.sourceName,
      sourceLink: row.sourceLink,
      reviewNote: row.reviewNote,
    }));
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Master History");
    const now = new Date();
    const safeName = (state.profile.companyName || "company")
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toLowerCase();
    XLSX.writeFile(
      wb,
      `${safeName}-step2-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}-${now.getFullYear()}.xlsx`,
    );
  };

  // ============================================================================
  // Render
  // ============================================================================
  return (
    <StepShell
      stepNumber={2}
      title="Historical Financials"
      subtitle="Fetch Yahoo Finance annual fundamentals and convert them into the Step 2 review JSON."
    >
      {/* ── Architecture gate ──────────────────────────────────────────────── */}
      {!hasArchitecture && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/30 p-4 text-sm text-amber-300">
          <AlertTriangle size={18} className="mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">Step 1 architecture not found</p>
            <p className="mt-1 text-xs text-amber-400/70">
              Complete Step 1 first — the segment architecture guides data extraction.
            </p>
          </div>
        </div>
      )}

      {hasArchitecture && (
        <div className="space-y-8">

          {/* ================================================================ */}
          {/*  EXTRACTION FORM                                                 */}
          {/* ================================================================ */}
          <section className="space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-zinc-400">
                Build Historical Baseline
              </h3>
              <span className="flex items-center gap-2 text-xs text-zinc-500">
                <span className="rounded bg-zinc-800 px-2 py-0.5 font-mono">
                  {confirmedYears.length}/{MAX_YEARS}
                </span>
                years confirmed
                {confirmedYears.length > 0 && (
                  <span className="text-zinc-600">({confirmedYears.join(", ")})</span>
                )}
              </span>
            </div>

            <div className="rounded-lg border border-blue-800/50 bg-blue-950/20 p-4">
              <div>
                <p className="text-sm font-medium text-blue-100">Yahoo Finance auto-import</p>
                <p className="mt-1 text-xs text-zinc-500">
                  The coworker will pull annual income statement, cash flow, and balance sheet
                  fundamentals for <span className="font-semibold text-blue-200">{ticker || "the Step 1 ticker"}</span>,
                  then stage the latest available fiscal years as consolidated Step 2 JSON.
                </p>
              </div>
              <div className="mt-3 rounded-lg border border-amber-800/40 bg-amber-950/20 px-3 py-2 text-xs text-amber-200/90">
                Yahoo Finance is consolidated company-level data. It is useful for DCF baseline
                revenue and operating income, but it does not replace filing-level segment/product
                disclosures.
              </div>
            </div>

            {/* Error banner */}
            {errorMsg && (
              <div className="flex items-start gap-2 rounded-lg border border-red-700/40 bg-red-950/30 p-3 text-sm text-red-300">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {errorMsg}
              </div>
            )}

            {/* Submit */}
            <button
              onClick={handleExtract}
              disabled={isExtracting || !canAddMoreYears}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-500"
            >
              {isExtracting ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  Fetching Yahoo Finance history…
                </>
              ) : (
                <>
                  <Plus size={16} />
                  Fetch Yahoo Finance Baseline
                </>
              )}
            </button>
          </section>

          {/* ================================================================ */}
          {/*  STAGING AREA (editable before confirming to master)             */}
          {/* ================================================================ */}
          {hasStagingData && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-amber-400">
                  Historical Baseline Staging {stagingYears.length > 0 ? `— FY ${stagingYears.join(", ")}` : ""}
                </h3>
                <span className="rounded bg-amber-900/30 px-2 py-0.5 text-xs text-amber-300">
                  {stagingRows.length} rows · {stagingYears.length} year(s) — review before confirming
                </span>
              </div>

              <Step2ReviewSummary results={structuredResults} />

              <div className="overflow-x-auto rounded-lg border border-zinc-700">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-800 text-zinc-400">
                    <tr>
                      <th className="px-3 py-2 font-medium">Qtr</th>
                      <th className="px-3 py-2 font-medium">Segment</th>
                      <th className="px-3 py-2 font-medium">Category</th>
                      <th className="px-3 py-2 font-medium">Product</th>
                      <th className="px-3 py-2 font-medium text-right">Revenue ($M)</th>
                      <th className="px-3 py-2 font-medium text-right">Op. Income ($M)</th>
                      <th className="px-3 py-2 font-medium">Internal?</th>
                      <th className="px-3 py-2 font-medium">Source</th>
                      <th className="px-3 py-2 font-medium">Review Note</th>
                      <th className="px-3 py-2 font-medium">Notes</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800">
                    {stagingRows.map((row) => (
                      <tr key={row.id} className="bg-zinc-900/50 hover:bg-zinc-800/50">
                        <td className="px-3 py-1.5 text-zinc-300">{row.quarter}</td>
                        <td className="px-3 py-1.5 text-zinc-300">{row.segment}</td>
                        <td className="px-3 py-1.5 text-zinc-400">{row.productCategory}</td>
                        <td className="px-3 py-1.5 text-zinc-400">{row.productName}</td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="any"
                            value={row.revenue ?? ""}
                            onChange={(e) =>
                              updateStagingCell(row.id, "revenue", parseNullableMetric(e.target.value))
                            }
                            placeholder="—"
                            className="w-24 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-right text-xs text-zinc-100 outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <input
                            type="number"
                            step="any"
                            value={row.operatingIncome ?? ""}
                            onChange={(e) =>
                              updateStagingCell(
                                row.id,
                                "operatingIncome",
                                parseNullableMetric(e.target.value),
                              )
                            }
                            placeholder="—"
                            className="w-24 rounded border border-zinc-700 bg-zinc-800 px-2 py-1 text-right text-xs text-zinc-100 outline-none focus:border-blue-500"
                          />
                        </td>
                        <td className="px-3 py-1.5 text-zinc-400">
                          {row.internalVerify ?? "No"}
                        </td>
                        <td
                          className="max-w-[140px] truncate px-3 py-1.5 text-zinc-400"
                          title={row.sourceLink && row.sourceLink !== "Not available"
                            ? `${row.sourceName ?? "Not available"} — ${row.sourceLink}`
                            : row.sourceName ?? "Not available"}
                        >
                          {row.sourceName ?? "Not available"}
                        </td>
                        <td
                          className="max-w-[180px] truncate px-3 py-1.5 text-amber-300/80"
                          title={row.reviewNote ?? row.reviewStatus ?? ""}
                        >
                          {row.reviewNote ?? row.reviewStatus ?? "External Verification Required"}
                        </td>
                        <td
                          className="max-w-[140px] truncate px-3 py-1.5 text-zinc-500"
                          title={row.notes}
                        >
                          {row.notes}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <button
                onClick={handleConfirm}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-emerald-500"
              >
                <CheckCircle2 size={16} />
                Confirm Historical Baseline
              </button>
            </section>
          )}

          {/* ================================================================ */}
          {/*  MASTER HISTORY (read-only, grouped by segment)                  */}
          {/* ================================================================ */}
          {masterRows.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-emerald-400">
                  Master History
                </h3>
                <span className="text-xs text-zinc-500">
                  {masterRows.length} rows · {confirmedYears.length} year(s)
                </span>
              </div>

              <div className="space-y-3">
                {Object.entries(groupedMaster).map(([segment, rows]) => (
                  <SegmentGroup key={segment} segment={segment} rows={rows} />
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-3 pt-2">
                <button
                  onClick={handleExcelDownload}
                  className="flex items-center gap-2 rounded-lg border border-emerald-600/50 bg-emerald-600/10 px-5 py-2.5 text-sm font-medium text-emerald-400 transition-colors hover:bg-emerald-600/20"
                >
                  <Download size={16} />
                  Download Master Excel Sheet
                </button>
                <button
                  onClick={() => dispatch({ type: "CLEAR_HISTORY" })}
                  className="flex items-center gap-2 rounded-lg border border-zinc-700 px-5 py-2.5 text-sm text-zinc-400 transition-colors hover:border-red-700/50 hover:text-red-400"
                >
                  <Trash2 size={16} />
                  Clear All History
                </button>
              </div>
            </section>
          )}

        </div>
      )}
    </StepShell>
  );
}

function Step2ReviewSummary({
  results,
}: {
  results: Step2StructuredResultForReview[];
}) {
  if (results.length === 0) return null;

  const rowCount = results.reduce((total, result) => total + result.rows.length, 0);
  const sourceMap = new Map<string, Step2StructuredResultForReview["sources"][number]>();
  for (const result of results) {
    for (const source of result.sources) sourceMap.set(source.source_id, source);
  }
  const sources = Array.from(sourceMap.values());
  const warningCount = results.reduce(
    (total, result) => total + result.validation_warnings.length,
    0,
  );
  const excludedItems = results.flatMap((result) => result.excluded_items);
  const years = results.map((result) => result.target_year).sort((a, b) => a - b);
  const summaryLine =
    results.length === 1
      ? results[0].review_summary.one_line
      : `${rowCount} verified historical rows across FY ${years[0]}-${years[years.length - 1]}; ready to anchor the DCF forecast baseline.`;
  const warnings = results.flatMap((result) => result.review_summary.warnings);

  return (
    <section className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-zinc-100">DCF Historical Baseline Review</p>
          <p className="mt-1 text-sm text-zinc-400">{summaryLine}</p>
        </div>
        <span className="rounded-full bg-amber-600/15 px-3 py-1 text-xs font-semibold text-amber-300">
          Review baseline
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
          {rowCount} extracted row(s)
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
          {sources.length} source(s)
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-sm text-zinc-300">
          {warningCount} warning(s)
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-200">
          {Array.from(new Set(warnings)).slice(0, 3).map((warning) => (
            <p key={warning}>{warning}</p>
          ))}
        </div>
      )}

      <details className="rounded-lg border border-zinc-800 bg-zinc-950">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-zinc-300 hover:text-zinc-100">
          Source and excluded item audit
        </summary>
        <div className="space-y-3 border-t border-zinc-800 p-4 text-xs text-zinc-400">
          {sources.slice(0, 8).map((source) => (
            <p key={source.source_id}>
              {source.name}: {source.locator ?? "No locator"}
            </p>
          ))}
          {excludedItems.slice(0, 8).map((item) => (
            <p key={`${item.label}-${item.reason}`} className="text-amber-300/80">
              Excluded: {item.label} - {item.reason}
            </p>
          ))}
        </div>
      </details>
    </section>
  );
}

function SegmentGroup({
  segment,
  rows,
}: {
  segment: string;
  rows: HistoricalExtractionRow[];
}) {
  const [open, setOpen] = useState(true);

  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-medium text-zinc-200 hover:bg-zinc-900"
      >
        <span>
          {segment}
          <span className="ml-2 text-xs font-normal text-zinc-500">
            ({rows.length} rows)
          </span>
        </span>
        <ChevronDown
          size={16}
          className={`text-zinc-500 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="overflow-x-auto border-t border-zinc-800">
          <table className="w-full text-left text-xs">
            <thead className="bg-zinc-900 text-zinc-500">
              <tr>
                <th className="px-3 py-1.5 font-medium">Year</th>
                <th className="px-3 py-1.5 font-medium">Qtr</th>
                <th className="px-3 py-1.5 font-medium">Category</th>
                <th className="px-3 py-1.5 font-medium">Product</th>
                <th className="px-3 py-1.5 font-medium text-right">Revenue ($M)</th>
                <th className="px-3 py-1.5 font-medium text-right">Op. Income ($M)</th>
                <th className="px-3 py-1.5 font-medium">Review</th>
                <th className="px-3 py-1.5 font-medium">Source</th>
                <th className="px-3 py-1.5 font-medium">Notes</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-800/50">
              {rows.map((row) => (
                <tr key={row.id} className="hover:bg-zinc-900/50">
                  <td className="px-3 py-1.5 text-zinc-300">{row.fiscalYear}</td>
                  <td className="px-3 py-1.5 text-zinc-300">{row.quarter}</td>
                  <td className="px-3 py-1.5 text-zinc-400">{row.productCategory}</td>
                  <td className="px-3 py-1.5 text-zinc-400">{row.productName}</td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-200">
                    {formatNullableMetric(row.revenue)}
                  </td>
                  <td className="px-3 py-1.5 text-right font-mono text-zinc-200">
                    {formatNullableMetric(row.operatingIncome)}
                  </td>
                  <td
                    className="max-w-[160px] truncate px-3 py-1.5 text-amber-300/80"
                    title={row.reviewNote ?? row.reviewStatus ?? ""}
                  >
                    {row.reviewStatus ?? "External Verification Required"}
                  </td>
                  <td
                    className="max-w-[140px] truncate px-3 py-1.5 text-zinc-500"
                    title={row.sourceLink && row.sourceLink !== "Not available"
                      ? `${row.sourceName ?? "Not available"} — ${row.sourceLink}`
                      : row.sourceName ?? "Not available"}
                  >
                    {row.sourceName ?? "Not available"}
                  </td>
                  <td
                    className="max-w-[140px] truncate px-3 py-1.5 text-zinc-500"
                    title={row.notes}
                  >
                    {row.notes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
