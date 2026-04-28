import { NextResponse } from "next/server";
import type { CFPExportPayload } from "@/types/cfp";

// =============================================================================
// GET /api/cfp-export
// =============================================================================
// Public contract consumed by the Core DCF Tool.
// Returns the 5-year annual FCF curve + 20-quarter detail.
//
// In production this will read from the CFP module's persisted state.
// For now it returns hardcoded mock data so the API contract is established.
// =============================================================================

export async function GET(): Promise<NextResponse<CFPExportPayload>> {
  const mockPayload: CFPExportPayload = {
    ticker: "AAPL",
    companyName: "Apple Inc.",
    currency: "USD",
    generatedAt: new Date().toISOString(),
    modelVersion: "0.1.0-alpha",

    // ---------- Annual FCF Curve (5 years) ----------
    annualFCFCurve: [
      { year: 2025, projectedFCF: 112_000_000_000, yoyGrowthRate: 0 },
      { year: 2026, projectedFCF: 119_840_000_000, yoyGrowthRate: 7.0 },
      { year: 2027, projectedFCF: 127_430_000_000, yoyGrowthRate: 6.3 },
      { year: 2028, projectedFCF: 134_280_000_000, yoyGrowthRate: 5.4 },
      { year: 2029, projectedFCF: 140_650_000_000, yoyGrowthRate: 4.7 },
    ],

    // ---------- 20-Quarter Detail ----------
    projectedQuarters: Array.from({ length: 20 }, (_, i) => {
      const yearOffset = Math.floor(i / 4);
      const q = ((i % 4) + 1) as 1 | 2 | 3 | 4;
      const baseRevenue = 95_000_000_000 + i * 1_800_000_000;
      const baseFCF = 26_000_000_000 + i * 600_000_000;

      return {
        quarter: { year: 2025 + yearOffset, quarter: q },
        projectedRevenue: baseRevenue,
        projectedFCF: baseFCF,
        revenueGrowthYoY: 6.5 - i * 0.1,
        fcfMargin: (baseFCF / baseRevenue) * 100,
        confidenceLevel: (i < 8 ? "high" : i < 16 ? "medium" : "low") as
          | "high"
          | "medium"
          | "low",
      };
    }),
  };

  return NextResponse.json(mockPayload);
}
