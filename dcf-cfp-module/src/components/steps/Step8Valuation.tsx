"use client";

import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import { AlertTriangle, BarChart3, CheckCircle2, Shield, SlidersHorizontal } from "lucide-react";
import StepShell from "./StepShell";
import { useCFP } from "@/context/CFPContext";
import { buildDcfValuation } from "@/lib/dcf-valuation";
import {
  buildStep5AssumptionRows,
  buildStep5ReviewWarningRows,
  getStep5StructuredResults,
} from "@/lib/aggregate-forecast";

function fmtM(value: number): string {
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 1 })}M`;
}

function fmtPct(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}

function fmtUpside(value: number | null): string {
  if (value === null) return "N/A";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function fmtPrice(value: number | null): string {
  if (value === null) return "N/A";
  return `$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function Step8Valuation() {
  const { state } = useCFP();
  const [fcfMargin, setFcfMargin] = useState(0.25);
  const [terminalGrowth, setTerminalGrowth] = useState(0.025);

  const valuation = useMemo(
    () =>
      buildDcfValuation({
        forecast: state.forecast,
        wacc: state.wacc,
        fcfMargin,
        terminalGrowth,
      }),
    [fcfMargin, state.forecast, state.wacc, terminalGrowth],
  );
  const step5Artifacts = useMemo(() => getStep5StructuredResults(state.forecast), [state.forecast]);
  const assumptionRows = useMemo(() => buildStep5AssumptionRows(state.forecast), [state.forecast]);
  const reviewWarnings = useMemo(() => buildStep5ReviewWarningRows(state.forecast), [state.forecast]);

  return (
    <StepShell
      stepNumber={8}
      title="DCF Valuation Dashboard"
      subtitle="Normalize the forecast package, bridge free cash flow to enterprise value, and expose the audit trail."
      completeLabel="Valuation Complete"
      onComplete={() => undefined}
    >
      <div className="space-y-6">
        <section className={`rounded-xl border p-5 ${
          valuation.decision.action === "BUY"
            ? "border-emerald-700/40 bg-emerald-950/15"
            : valuation.decision.action === "AVOID"
              ? "border-red-700/40 bg-red-950/15"
              : "border-amber-700/40 bg-amber-950/15"
        }`}>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">Business Decision</p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-2xl font-semibold text-zinc-100">{valuation.decision.label}</h3>
            <span className="rounded-full bg-zinc-950 px-3 py-1 text-xs font-semibold text-zinc-300">
              {fmtPrice(valuation.intrinsicValuePerShare)} vs {fmtPrice(valuation.currentPrice)}
            </span>
          </div>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-zinc-300">{valuation.decision.summary}</p>
        </section>

        <section className="rounded-xl border border-emerald-700/40 bg-emerald-950/10 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-emerald-300">
                <Shield size={16} /> Valuation Output
              </h3>
              <p className="mt-1 text-sm text-zinc-400">
                This output uses the approved Step 5 annual machine artifact and saved Step 7 WACC as the valuation source of truth.
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
            <div className="mt-5 flex items-start gap-2 rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-200">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" />
              <span>{valuation.warnings.join(" ")}</span>
            </div>
          ) : (
            <div className="mt-5 space-y-5">
              <div className="grid gap-3 sm:grid-cols-4">
                <MetricCard label="Intrinsic / Share" value={fmtPrice(valuation.intrinsicValuePerShare)} highlight />
                <MetricCard label="Current Price" value={fmtPrice(valuation.currentPrice)} />
                <MetricCard label="DCF Equity Value" value={fmtM(valuation.equityValueUsdM)} />
                <MetricCard label="Enterprise Value" value={fmtM(valuation.enterpriseValueUsdM)} />
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
                  <AssumptionSlider label="FCF Margin" value={fcfMargin} min={0.15} max={0.35} step={0.005} onChange={setFcfMargin} />
                  <AssumptionSlider label="Terminal Growth" value={terminalGrowth} min={0.01} max={0.04} step={0.001} onChange={setTerminalGrowth} />
                  <div className="rounded-lg bg-zinc-900 px-3 py-2 text-xs text-zinc-400">
                    Net debt bridge: {fmtM(valuation.netDebtUsdM)}. Revenue scale factor: {valuation.revenueScaleFactor}x.
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <section className="grid gap-4 lg:grid-cols-3">
          <InfoPanel title="Market Sanity Check" icon={<BarChart3 size={15} />}>
            <p>
              Recent public analyst target references for AAPL cluster around $299-$303 average target, with high targets around $350.
              Treat that as a cross-check only; it is not an input to this DCF.
            </p>
          </InfoPanel>

          <InfoPanel title="Top Model Drivers" icon={<CheckCircle2 size={15} />}>
            {assumptionRows.length > 0 ? (
              <ul className="space-y-1.5">
                {assumptionRows.slice(0, 5).map((row) => (
                  <li key={`${row.segment}-${row.assumption_id}`}>
                    <span className="font-mono text-blue-300">{row.assumption_id}</span>{" "}
                    <span className="text-zinc-500">{row.driver_quality}</span> {row.statement}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No Step 5 assumption registry is available.</p>
            )}
          </InfoPanel>

          <InfoPanel title="Audit Flags" icon={<AlertTriangle size={15} />}>
            {reviewWarnings.length > 0 || valuation.warnings.length > 0 ? (
              <ul className="space-y-1.5">
                {valuation.warnings.map((warning) => (
                  <li key={warning}><span className="font-mono text-amber-300">VALUATION</span> {warning}</li>
                ))}
                {reviewWarnings.slice(0, 5).map((row, index) => (
                  <li key={`${row.audit_flag}-${index}`}>
                    <span className="font-mono text-amber-300">{row.audit_flag}</span> {row.warning}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No valuation or Step 5 review warnings.</p>
            )}
          </InfoPanel>
        </section>

        {step5Artifacts.length === 0 && (
          <div className="rounded-lg border border-amber-700/40 bg-amber-950/20 p-3 text-sm text-amber-200">
            Step 5 structured machine artifact is missing; rerun and approve Step 5 before relying on this output.
          </div>
        )}
      </div>
    </StepShell>
  );
}

function MetricCard({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
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

function InfoPanel({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-950 p-4 text-xs text-zinc-300">
      <h4 className="mb-2 flex items-center gap-2 font-semibold uppercase tracking-wider text-zinc-400">
        {icon} {title}
      </h4>
      {children}
    </div>
  );
}
