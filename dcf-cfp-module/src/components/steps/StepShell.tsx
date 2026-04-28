"use client";

import { useCFP } from "@/context/CFPContext";
import type { ReactNode } from "react";

/**
 * Reusable wrapper for every wizard step.
 * Renders a title, description placeholder, children,
 * and wired-up Previous / Next navigation buttons.
 */
export default function StepShell({
  stepNumber,
  title,
  subtitle,
  children,
  onNext,
  nextDisabled,
  onComplete,
  completeDisabled,
  completeLabel = "Complete",
}: {
  stepNumber: number;
  title: string;
  subtitle: string;
  children?: ReactNode;
  onNext?: () => void;
  nextDisabled?: boolean;
  onComplete?: () => void;
  completeDisabled?: boolean;
  completeLabel?: string;
}) {
  const { dispatch, totalSteps } = useCFP();

  const isFirst = stepNumber === 1;
  const isLast = stepNumber === totalSteps;

  return (
    <div className="mx-auto w-full max-w-3xl">
      {/* Header */}
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-widest text-blue-400">
          Step {stepNumber} of {totalSteps}
        </p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-zinc-100 sm:text-3xl">
          {title}
        </h1>
        <p className="mt-2 text-sm text-zinc-400">{subtitle}</p>
      </div>

      {/* Step-specific content */}
      <div className="min-h-[240px] rounded-xl border border-dashed border-zinc-700 bg-zinc-900/50 p-6">
        {children}
      </div>

      {/* Navigation */}
      <div className="mt-8 flex items-center justify-between">
        <button
          disabled={isFirst}
          onClick={() => dispatch({ type: "PREV_STEP" })}
          className={`
            rounded-lg px-5 py-2.5 text-sm font-medium transition-colors
            ${isFirst
              ? "cursor-not-allowed bg-zinc-800 text-zinc-600"
              : "bg-zinc-800 text-zinc-300 hover:bg-zinc-700 hover:text-white"
            }
          `}
        >
          &larr; Previous
        </button>

        <button
          disabled={isLast ? completeDisabled : nextDisabled}
          onClick={() => {
            if (isLast) onComplete?.();
            else if (onNext) onNext();
            else dispatch({ type: "NEXT_STEP" });
          }}
          className={`
            rounded-lg px-5 py-2.5 text-sm font-medium transition-colors
            ${isLast
              ? completeDisabled
                ? "cursor-not-allowed bg-zinc-800 text-zinc-600"
                : "bg-emerald-600 text-white hover:bg-emerald-500"
              : nextDisabled
                ? "cursor-not-allowed bg-zinc-800 text-zinc-600"
                : "bg-blue-600 text-white hover:bg-blue-500"
            }
          `}
        >
          {isLast ? completeLabel : "Next \u2192"}
        </button>
      </div>
    </div>
  );
}
