import type { BusinessArchitecture, ForecastState, Step5ForecastRow } from "../types/cfp.ts";
import type { WACCSegmentRow } from "../types/wacc.ts";
import { getStep5StructuredResults } from "./aggregate-forecast.ts";

export function buildWaccSegmentsFromCFP(
  architecture: BusinessArchitecture | null | undefined,
  forecast: ForecastState,
  makeId: (segmentName: string) => string,
): WACCSegmentRow[] {
  const segments = architecture?.architecture ?? [];
  return segments.map((segment) => ({
    id: makeId(segment.segment),
    name: segment.segment,
    unleveredBeta: 1.0,
    estimatedValue: Math.round(
      structuredFy5RevenueForSegment(forecast, segment.segment) ??
      legacyFy5RevenueForSegment(forecast, segment.segment),
    ),
  }));
}

function structuredFy5RevenueForSegment(
  forecast: ForecastState,
  segmentName: string,
): number | null {
  const rows = getStep5StructuredResults(forecast).flatMap(
    (result) => result.machine_artifact.forecast_table,
  );
  const fy5Rows = rows.filter(
    (row) => segmentNamesMatch(row.segment, segmentName) && forecastYearIndex(row) === 5,
  );

  if (fy5Rows.length === 0) return null;
  return fy5Rows.reduce((sum, row) => sum + row.revenue_base_usd_m, 0);
}

function legacyFy5RevenueForSegment(forecast: ForecastState, segmentName: string): number {
  const matchingForecast = forecast.segments.find((segment) =>
    segmentNamesMatch(segment.segment, segmentName),
  );
  if (!matchingForecast) return 0;

  return matchingForecast.products.reduce(
    (segmentTotal, product) =>
      segmentTotal +
      product.forecast
        .filter((point) => point.year === 5)
        .reduce((productTotal, point) => productTotal + point.revenueM, 0),
    0,
  );
}

function forecastYearIndex(row: Step5ForecastRow): number | null {
  const plusMatch = row.fiscal_year.match(/FY\+?(\d+)/i);
  if (plusMatch) return Number(plusMatch[1]);

  const plainMatch = row.fiscal_year.match(/Y(?:ear)?\s*(\d+)/i);
  if (plainMatch) return Number(plainMatch[1]);

  const numericMatch = row.fiscal_year.match(/(\d+)/);
  if (numericMatch) return Number(numericMatch[1]);

  return null;
}

function normalizeName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function isHardwareLike(value: string): boolean {
  const normalized = normalizeName(value);
  return normalized.includes("hardware") || normalized === "products";
}

function segmentNamesMatch(source: string, target: string): boolean {
  const sourceName = normalizeName(source);
  const targetName = normalizeName(target);
  if (sourceName === targetName) return true;
  return isHardwareLike(source) && isHardwareLike(target);
}
