import type {
  AggregatedRow,
  ForecastState,
  Step5ForecastRow,
  Step5StructuredResult,
} from "@/types/cfp";

export interface Step5AssumptionExportRow {
  segment: string;
  assumption_id: string;
  statement: string;
  driver_quality: string;
  driver_eligibility_source: string;
  arithmetic_trace: string;
  basis_claim_ids: string;
  management_override_required: boolean;
}

export interface Step5WeakSensitivityExportRow {
  segment: string;
  assumption_id: string;
  evidence_level: string;
  if_removed_revenue_impact_usd_m: number;
  fy5_impact_pct: number;
  flag: string;
}

export interface Step5ReviewWarningExportRow {
  segment: string;
  source: "review_warning" | "forecast_flag" | "workflow_status";
  warning: string;
  audit_flag: string;
  fiscal_year?: string;
  category?: string;
  workflow_status?: string;
  next_action?: string;
}

/**
 * Aggregates the massive 20-quarter product-level forecast into
 * annual (FY1–FY5) totals grouped by Segment → Category, with
 * subtotals per segment and a consolidated grand total.
 *
 * CAGR formula: ((FY5 / FY1) ^ (1/4)) - 1
 * (4 periods of growth between Year 1 and Year 5)
 */
export function aggregateMasterForecast(forecastState: ForecastState): AggregatedRow[] {
  const structuredResults = getStep5StructuredResults(forecastState);
  if (structuredResults.length > 0) {
    return aggregateStructuredForecast(structuredResults);
  }

  // Step 1: Build a nested map  Segment → Category → { fy1..fy5 }
  const map = new Map<string, Map<string, [number, number, number, number, number]>>();

  for (const seg of forecastState.segments) {
    if (!map.has(seg.segment)) map.set(seg.segment, new Map());
    const catMap = map.get(seg.segment)!;

    for (const prod of seg.products) {
      const catKey = prod.categoryName || prod.productName;
      if (!catMap.has(catKey)) catMap.set(catKey, [0, 0, 0, 0, 0]);
      const totals = catMap.get(catKey)!;

      for (const q of prod.forecast) {
        const yearIdx = (q.year ?? 1) - 1; // year 1→index 0
        if (yearIdx >= 0 && yearIdx < 5) {
          totals[yearIdx] += q.revenueM;
        }
      }
    }
  }

  // Step 2: Build the rows array with subtotals
  const rows: AggregatedRow[] = [];
  const grandTotals: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  const sortedSegments = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [segment, catMap] of sortedSegments) {
    const segTotals: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    const sortedCats = [...catMap.entries()].sort(([a], [b]) => a.localeCompare(b));

    for (const [category, totals] of sortedCats) {
      const [fy1, fy2, fy3, fy4, fy5] = totals.map(v => round(v));
      rows.push({
        segment,
        category,
        fy1, fy2, fy3, fy4, fy5,
        cagr: calcCAGR(fy1, fy5),
      });
      for (let i = 0; i < 5; i++) segTotals[i] += totals[i];
    }

    // Segment subtotal
    const [s1, s2, s3, s4, s5] = segTotals.map(v => round(v));
    rows.push({
      segment,
      category: `${segment} Subtotal`,
      fy1: s1, fy2: s2, fy3: s3, fy4: s4, fy5: s5,
      cagr: calcCAGR(s1, s5),
      isSubtotal: true,
    });

    for (let i = 0; i < 5; i++) grandTotals[i] += segTotals[i];
  }

  // Grand total
  const [g1, g2, g3, g4, g5] = grandTotals.map(v => round(v));
  rows.push({
    segment: "",
    category: "CONSOLIDATED TOTAL",
    fy1: g1, fy2: g2, fy3: g3, fy4: g4, fy5: g5,
    cagr: calcCAGR(g1, g5),
    isTotal: true,
  });

  return rows;
}

export function getStep5StructuredResults(forecastState: ForecastState): Step5StructuredResult[] {
  const direct = forecastState.structuredResults ?? [];
  const fromSegments = forecastState.segments
    .map((segment) => segment.structuredResult)
    .filter((result): result is Step5StructuredResult => !!result);

  const seen = new Set<string>();
  return [...direct, ...fromSegments].filter((result) => {
    const key = `${result.company_name}|${result.machine_artifact.forecast_mode}|${result.machine_artifact.forecast_table
      .map((row) => `${row.segment}:${row.category}:${row.fiscal_year}:${row.quarter ?? ""}`)
      .join("|")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildStep5AssumptionRows(forecastState: ForecastState): Step5AssumptionExportRow[] {
  return getStep5StructuredResults(forecastState).flatMap((result) => {
    const segmentLabel = artifactSegmentLabel(result);
    return result.machine_artifact.assumptions.map((assumption) => ({
      segment: segmentLabel,
      assumption_id: assumption.id,
      statement: assumption.statement,
      driver_quality: assumption.driver_quality,
      driver_eligibility_source: assumption.driver_eligibility_source,
      arithmetic_trace: assumption.arithmetic_trace,
      basis_claim_ids: assumption.basis_claim_ids.join(", "),
      management_override_required: assumption.management_override_required,
    }));
  });
}

export function buildStep5WeakSensitivityRows(
  forecastState: ForecastState,
): Step5WeakSensitivityExportRow[] {
  return getStep5StructuredResults(forecastState).flatMap((result) => {
    const segmentLabel = artifactSegmentLabel(result);
    return result.machine_artifact.weak_inference_sensitivity.map((entry) => ({
      segment: segmentLabel,
      assumption_id: entry.assumption_id,
      evidence_level: entry.evidence_level,
      if_removed_revenue_impact_usd_m: entry.if_removed_revenue_impact_usd_m,
      fy5_impact_pct: entry.fy5_impact_pct,
      flag: entry.flag,
    }));
  });
}

export function buildStep5ReviewWarningRows(forecastState: ForecastState): Step5ReviewWarningExportRow[] {
  return getStep5StructuredResults(forecastState).flatMap((result) => {
    const segmentLabel = artifactSegmentLabel(result);
    const artifact = result.machine_artifact;
    const reviewWarnings = result.review_summary.warnings.map((warning) => ({
      segment: segmentLabel,
      source: "review_warning" as const,
      warning,
      audit_flag: "REVIEW_WARNING",
      workflow_status: artifact.workflow_status,
      next_action: artifact.next_action,
    }));

    const forecastFlags = artifact.forecast_table.flatMap((row) =>
      row.flags.map((flag) => ({
        segment: row.segment,
        source: "forecast_flag" as const,
        warning: `${row.fiscal_year} ${row.category}: ${flag}`,
        audit_flag: flag,
        fiscal_year: row.fiscal_year,
        category: row.category,
        workflow_status: artifact.workflow_status,
        next_action: artifact.next_action,
      })),
    );

    const workflowWarning =
      artifact.workflow_status === "READY"
        ? []
        : [{
            segment: segmentLabel,
            source: "workflow_status" as const,
            warning: `Step 5 workflow status is ${artifact.workflow_status}.`,
            audit_flag: artifact.workflow_status,
            workflow_status: artifact.workflow_status,
            next_action: artifact.next_action,
          }];

    return [...reviewWarnings, ...forecastFlags, ...workflowWarning];
  });
}

function aggregateStructuredForecast(results: Step5StructuredResult[]): AggregatedRow[] {
  const map = new Map<string, Map<string, [number, number, number, number, number]>>();
  const absoluteYearIndex = buildAbsoluteYearIndex(results);

  for (const result of results) {
    for (const row of result.machine_artifact.forecast_table) {
      const yearIdx = yearIndexFromForecastRow(row, absoluteYearIndex);
      if (yearIdx < 0 || yearIdx > 4) continue;

      const segment = row.segment;
      const category = row.category || row.product || "Segment Forecast";
      if (!map.has(segment)) map.set(segment, new Map());
      const catMap = map.get(segment)!;
      if (!catMap.has(category)) catMap.set(category, [0, 0, 0, 0, 0]);

      catMap.get(category)![yearIdx] += row.revenue_base_usd_m;
    }
  }

  return rowsFromSegmentMap(map);
}

function rowsFromSegmentMap(
  map: Map<string, Map<string, [number, number, number, number, number]>>,
): AggregatedRow[] {
  const rows: AggregatedRow[] = [];
  const grandTotals: [number, number, number, number, number] = [0, 0, 0, 0, 0];

  const sortedSegments = [...map.entries()].sort(([a], [b]) => a.localeCompare(b));

  for (const [segment, catMap] of sortedSegments) {
    const segTotals: [number, number, number, number, number] = [0, 0, 0, 0, 0];
    const sortedCats = [...catMap.entries()].sort(([a], [b]) => a.localeCompare(b));

    for (const [category, totals] of sortedCats) {
      const [fy1, fy2, fy3, fy4, fy5] = totals.map(v => round(v));
      rows.push({
        segment,
        category,
        fy1, fy2, fy3, fy4, fy5,
        cagr: calcCAGR(fy1, fy5),
      });
      for (let i = 0; i < 5; i++) segTotals[i] += totals[i];
    }

    const [s1, s2, s3, s4, s5] = segTotals.map(v => round(v));
    rows.push({
      segment,
      category: `${segment} Subtotal`,
      fy1: s1, fy2: s2, fy3: s3, fy4: s4, fy5: s5,
      cagr: calcCAGR(s1, s5),
      isSubtotal: true,
    });

    for (let i = 0; i < 5; i++) grandTotals[i] += segTotals[i];
  }

  const [g1, g2, g3, g4, g5] = grandTotals.map(v => round(v));
  rows.push({
    segment: "",
    category: "CONSOLIDATED TOTAL",
    fy1: g1, fy2: g2, fy3: g3, fy4: g4, fy5: g5,
    cagr: calcCAGR(g1, g5),
    isTotal: true,
  });

  return rows;
}

/** CAGR = ((FY5 / FY1) ^ (1/4)) - 1, expressed as percentage */
function calcCAGR(fy1: number, fy5: number): number {
  if (fy1 <= 0 || fy5 <= 0) return 0;
  const cagr = (Math.pow(fy5 / fy1, 1 / 4) - 1) * 100;
  return round(cagr);
}

function round(v: number): number {
  return Math.round(v * 10) / 10;
}

function yearIndexFromForecastRow(row: Step5ForecastRow, absoluteYearIndex = new Map<number, number>()): number {
  const absoluteYear = parseAbsoluteFiscalYear(row.fiscal_year);
  if (absoluteYear !== null) return absoluteYearIndex.get(absoluteYear) ?? -1;

  const plusMatch = row.fiscal_year.match(/FY\+(\d+)/i);
  if (plusMatch) return Number(plusMatch[1]) - 1;

  const plainMatch = row.fiscal_year.match(/Y(?:ear)?\s*(\d+)/i);
  if (plainMatch) return Number(plainMatch[1]) - 1;

  return -1;
}

function buildAbsoluteYearIndex(results: Step5StructuredResult[]): Map<number, number> {
  const years = Array.from(
    new Set(
      results
        .flatMap((result) => result.machine_artifact.forecast_table)
        .map((row) => parseAbsoluteFiscalYear(row.fiscal_year))
        .filter((year): year is number => year !== null),
    ),
  ).sort((a, b) => a - b);

  return new Map(years.slice(Math.max(0, years.length - 5)).map((year, index) => [year, index]));
}

function parseAbsoluteFiscalYear(fiscalYear: string): number | null {
  const match = fiscalYear.match(/\b(?:FY\s*)?(20\d{2}|2100)\b/i);
  if (!match) return null;
  return Number(match[1]);
}

function artifactSegmentLabel(result: Step5StructuredResult): string {
  const segments = Array.from(
    new Set(result.machine_artifact.forecast_table.map((row) => row.segment).filter(Boolean)),
  );
  return segments.join(", ") || "Consolidated";
}
