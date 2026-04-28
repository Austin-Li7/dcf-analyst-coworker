"use client";

import StepShell from "./StepShell";

export default function Step5CapitalMoats() {
  return (
    <StepShell
      stepNumber={5}
      title="20-Quarter Forecast"
      subtitle="AI-driven revenue projections with sensitivity controls — see Step 5 Forecast."
    >
      <div className="flex flex-col items-center justify-center gap-4 py-10 text-center">
        <p className="text-zinc-500 text-sm">This step has been replaced by the Quant Forecast Engine below.</p>
      </div>
    </StepShell>
  );
}
