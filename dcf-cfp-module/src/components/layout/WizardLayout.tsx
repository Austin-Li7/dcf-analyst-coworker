"use client";

import { useState } from "react";
import { Settings } from "lucide-react";
import { useCFP } from "@/context/CFPContext";
import { useSettings } from "@/context/SettingsContext";
import SettingsModal from "@/components/ui/SettingsModal";
import Step1Profile from "@/components/steps/Step1Profile";
import Step2History from "@/components/steps/Step2History";
import Step3Competition from "@/components/steps/Step3Competition";
import Step4Synergies from "@/components/steps/Step4Synergies";
import Step5Forecast from "@/components/steps/Step5Forecast";
import Step6Summary from "@/components/steps/Step6Summary";
import Step7WACC from "@/components/steps/Step7WACC";
import Step8Valuation from "@/components/steps/Step8Valuation";
import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Step metadata
// ---------------------------------------------------------------------------
interface StepMeta {
  number: number;
  label: string;
  shortLabel: string;
}

interface StepGroup {
  title: string;
  steps: StepMeta[];
}

const STEP_GROUPS: StepGroup[] = [
  {
    title: "Module 1 — Cash Flow Projector",
    steps: [
      { number: 1, label: "Company Profile", shortLabel: "Profile" },
      { number: 2, label: "Historical Financials", shortLabel: "History" },
      { number: 3, label: "Competitive Landscape", shortLabel: "Competition" },
      { number: 4, label: "Synergies & Drivers", shortLabel: "Synergies" },
      { number: 5, label: "20-Q Forecast", shortLabel: "Forecast" },
      { number: 6, label: "Executive Summary", shortLabel: "Summary" },
    ],
  },
  {
    title: "Module 2 — Discount Rate",
    steps: [
      { number: 7, label: "WACC Calculator", shortLabel: "WACC" },
      { number: 8, label: "DCF Valuation", shortLabel: "Valuation" },
    ],
  },
];

// ---------------------------------------------------------------------------
// Step renderer
// ---------------------------------------------------------------------------
function ActiveStep({ step }: { step: number }): ReactNode {
  switch (step) {
    case 1: return <Step1Profile />;
    case 2: return <Step2History />;
    case 3: return <Step3Competition />;
    case 4: return <Step4Synergies />;
    case 5: return <Step5Forecast />;
    case 6: return <Step6Summary />;
    case 7: return <Step7WACC />;
    case 8: return <Step8Valuation />;
    default: return null;
  }
}

// ---------------------------------------------------------------------------
// Sidebar step item
// ---------------------------------------------------------------------------
function SidebarItem({
  meta,
  currentStep,
  onClick,
}: {
  meta: StepMeta;
  currentStep: number;
  onClick: () => void;
}) {
  const isActive = meta.number === currentStep;
  const isCompleted = meta.number < currentStep;

  return (
    <button
      onClick={onClick}
      className={`
        group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left
        transition-all duration-200
        ${isActive
          ? "bg-blue-600/10 text-blue-400 ring-1 ring-blue-500/30"
          : isCompleted
            ? "text-emerald-400 hover:bg-emerald-500/10"
            : "text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        }
      `}
    >
      {/* Step number badge */}
      <span
        className={`
          flex h-7 w-7 shrink-0 items-center justify-center rounded-full
          text-xs font-bold transition-colors
          ${isActive
            ? "bg-blue-600 text-white"
            : isCompleted
              ? "bg-emerald-600 text-white"
              : "bg-zinc-800 text-zinc-500 group-hover:bg-zinc-700"
          }
        `}
      >
        {isCompleted ? "✓" : meta.number}
      </span>

      {/* Label */}
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{meta.shortLabel}</p>
        <p className="truncate text-xs text-zinc-600">{meta.label}</p>
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Top progress bar (mobile-friendly)
// ---------------------------------------------------------------------------
function ProgressBar({ current, total }: { current: number; total: number }) {
  const pct = ((current - 1) / (total - 1)) * 100;
  return (
    <div className="mb-1">
      <div className="flex items-center justify-between px-1 text-xs text-zinc-500">
        <span>Step {current} of {total}</span>
        <span>{Math.round(pct)}% complete</span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-zinc-800">
        <div
          className="h-full rounded-full bg-gradient-to-r from-blue-600 to-emerald-500 transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// =============================================================================
// WizardLayout — the master frame
// =============================================================================
export default function WizardLayout() {
  const { state, dispatch, totalSteps } = useCFP();
  const { activeApiKey } = useSettings();
  const [showSettings, setShowSettings] = useState(false);

  const hasKey = activeApiKey.trim().length > 0;

  return (
    <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
      <SettingsModal open={showSettings} onClose={() => setShowSettings(false)} />
      {/* ---- Sidebar (hidden on small screens) ---- */}
      <aside className="hidden w-64 shrink-0 border-r border-zinc-800 bg-zinc-900/60 p-4 lg:block">
        <h2 className="mb-6 text-lg font-semibold tracking-tight text-zinc-200">
          DCF Valuation Tool
        </h2>

        <nav className="flex flex-col gap-1">
          {STEP_GROUPS.map((group, gi) => (
            <div key={gi}>
              {gi > 0 && <div className="my-3 border-t border-zinc-800" />}
              <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-zinc-600">
                {group.title}
              </p>
              <div className="flex flex-col gap-1.5">
                {group.steps.map((s) => (
                  <SidebarItem
                    key={s.number}
                    meta={s}
                    currentStep={state.currentStep}
                    onClick={() => dispatch({ type: "SET_STEP", payload: s.number })}
                  />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-8 rounded-lg border border-zinc-800 bg-zinc-900 p-3 text-xs text-zinc-500">
          <p className="font-medium text-zinc-400">DCF Valuation Tool</p>
          <p className="mt-1">Complete the CFP module, calculate WACC, then review the final DCF valuation dashboard.</p>
        </div>
      </aside>

      {/* ---- Main content ---- */}
      <main className="flex flex-1 flex-col overflow-y-auto">
        {/* Top bar */}
        <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/80 px-6 py-4 backdrop-blur">
          <div className="flex items-center gap-4">
            <div className="flex-1">
              <ProgressBar current={state.currentStep} total={totalSteps} />
            </div>
            <button
              onClick={() => setShowSettings(true)}
              className="relative shrink-0 rounded-lg p-2 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-300"
              title="Settings"
            >
              <Settings size={18} />
              {/* Key status indicator dot */}
              <span className={`absolute right-1 top-1 h-2 w-2 rounded-full ${hasKey ? "bg-emerald-500" : "bg-red-500"}`} />
            </button>
          </div>
        </header>

        {/* Active step content */}
        <section className="flex-1 px-6 py-8">
          <ActiveStep step={state.currentStep} />
        </section>
      </main>
    </div>
  );
}
