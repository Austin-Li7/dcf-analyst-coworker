import { aggregateMasterForecast } from "./aggregate-forecast.ts";
import type { AggregatedRow, ForecastState } from "../types/cfp.ts";
import type { WACCState } from "../types/wacc.ts";

export interface DcfForecastValueRow {
  year: number;
  revenueUsdM: number;
  fcffUsdM: number;
  discountFactor: number;
  presentValueUsdM: number;
}

export type DcfDecisionAction = "BUY" | "WATCH" | "AVOID" | "INSUFFICIENT_DATA";

export interface DcfDecision {
  action: DcfDecisionAction;
  label: string;
  summary: string;
}

export interface DcfValuationResult {
  hasInputs: boolean;
  forecastRows: DcfForecastValueRow[];
  fcfMargin: number;
  terminalGrowth: number;
  revenueScaleFactor: number;
  wacc: number | null;
  terminalValueUsdM: number;
  terminalPresentValueUsdM: number;
  enterpriseValueUsdM: number;
  netDebtUsdM: number;
  equityValueUsdM: number;
  marketCapUsdM: number | null;
  currentPrice: number | null;
  intrinsicValuePerShare: number | null;
  impliedUpsidePct: number | null;
  decision: DcfDecision;
  warnings: string[];
}

export function buildDcfValuation({
  forecast,
  wacc,
  fcfMargin,
  terminalGrowth,
}: {
  forecast: ForecastState;
  wacc: WACCState;
  fcfMargin: number;
  terminalGrowth: number;
}): DcfValuationResult {
  const discountRate = wacc.calculation?.wacc ?? null;
  const totalRow = forecast.approved ? aggregateMasterForecast(forecast).find((row) => row.isTotal) : null;
  const warnings: string[] = [];
  const marketCapUsdM = wacc.fetchedData?.marketCap ? wacc.fetchedData.marketCap / 1_000_000 : null;
  const sharesOutstandingM = wacc.fetchedData?.sharesOutstanding
    ? wacc.fetchedData.sharesOutstanding / 1_000_000
    : null;
  const currentPrice = wacc.fetchedData?.currentPrice
    ?? (marketCapUsdM && sharesOutstandingM ? marketCapUsdM / sharesOutstandingM : null);

  if (!totalRow || !discountRate || discountRate <= terminalGrowth) {
    return emptyResult({
      fcfMargin,
      terminalGrowth,
      wacc: discountRate,
      warnings: [
        !totalRow ? "Step 5/6 approved annual forecast is required." : "",
        !discountRate ? "Step 7 WACC calculation is required." : "",
        discountRate && discountRate <= terminalGrowth
          ? "WACC must be greater than terminal growth."
          : "",
      ].filter(Boolean),
    });
  }

  const { scaleFactor, warning: scaleWarning } = inferRevenueScale(annualRevenueValues(totalRow), marketCapUsdM);
  if (scaleWarning) warnings.push(scaleWarning);

  const forecastRows = annualRevenueValues(totalRow).map((rawRevenueUsdM, index) => {
    const revenueUsdM = rawRevenueUsdM * scaleFactor;
    const year = index + 1;
    const fcffUsdM = revenueUsdM * fcfMargin;
    const discountFactor = 1 / Math.pow(1 + discountRate, year);
    return {
      year,
      revenueUsdM: round(revenueUsdM),
      fcffUsdM: round(fcffUsdM),
      discountFactor,
      presentValueUsdM: round(fcffUsdM * discountFactor),
    };
  });

  const terminalFcff = forecastRows[4].fcffUsdM * (1 + terminalGrowth);
  const terminalValueUsdM = terminalFcff / (discountRate - terminalGrowth);
  const terminalPresentValueUsdM = terminalValueUsdM / Math.pow(1 + discountRate, 5);
  const enterpriseValueUsdM =
    forecastRows.reduce((sum, row) => sum + row.presentValueUsdM, 0) + terminalPresentValueUsdM;
  const totalDebtUsdM = (wacc.fetchedData?.totalDebt ?? 0) / 1_000_000;
  const totalCashUsdM = (wacc.fetchedData?.totalCash ?? 0) / 1_000_000;
  const netDebtUsdM = totalDebtUsdM - totalCashUsdM;
  const equityValueUsdM = enterpriseValueUsdM - netDebtUsdM;
  const impliedUpsidePct =
    marketCapUsdM && marketCapUsdM > 0 ? (equityValueUsdM / marketCapUsdM - 1) * 100 : null;
  const roundedUpside = impliedUpsidePct === null ? null : round(impliedUpsidePct);
  const intrinsicValuePerShare =
    sharesOutstandingM && sharesOutstandingM > 0 ? equityValueUsdM / sharesOutstandingM : null;

  if (!wacc.fetchedData?.totalCash) {
    warnings.push("Cash was unavailable from market data; equity bridge uses debt only.");
  }

  return {
    hasInputs: true,
    forecastRows,
    fcfMargin,
    terminalGrowth,
    revenueScaleFactor: scaleFactor,
    wacc: discountRate,
    terminalValueUsdM: round(terminalValueUsdM),
    terminalPresentValueUsdM: round(terminalPresentValueUsdM),
    enterpriseValueUsdM: round(enterpriseValueUsdM),
    netDebtUsdM: round(netDebtUsdM),
    equityValueUsdM: round(equityValueUsdM),
    marketCapUsdM: marketCapUsdM === null ? null : round(marketCapUsdM),
    currentPrice: currentPrice === null ? null : round(currentPrice),
    intrinsicValuePerShare: intrinsicValuePerShare === null ? null : round(intrinsicValuePerShare),
    impliedUpsidePct: roundedUpside,
    decision: buildDecision(roundedUpside, warnings),
    warnings,
  };
}

function annualRevenueValues(row: AggregatedRow): number[] {
  return [row.fy1, row.fy2, row.fy3, row.fy4, row.fy5];
}

function emptyResult({
  fcfMargin,
  terminalGrowth,
  wacc,
  warnings,
}: {
  fcfMargin: number;
  terminalGrowth: number;
  wacc: number | null;
  warnings: string[];
}): DcfValuationResult {
  return {
    hasInputs: false,
    forecastRows: [],
    fcfMargin,
    terminalGrowth,
    revenueScaleFactor: 1,
    wacc,
    terminalValueUsdM: 0,
    terminalPresentValueUsdM: 0,
    enterpriseValueUsdM: 0,
    netDebtUsdM: 0,
    equityValueUsdM: 0,
    marketCapUsdM: null,
    currentPrice: null,
    intrinsicValuePerShare: null,
    impliedUpsidePct: null,
    decision: {
      action: "INSUFFICIENT_DATA",
      label: "Insufficient Data",
      summary: "The model cannot produce a business decision until Step 5 forecast and Step 7 WACC are both available.",
    },
    warnings,
  };
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function inferRevenueScale(
  annualRevenueUsdM: number[],
  marketCapUsdM: number | null,
): { scaleFactor: number; warning: string | null } {
  const firstRevenue = annualRevenueUsdM.find((value) => value > 0) ?? 0;
  if (!marketCapUsdM || marketCapUsdM <= 0 || firstRevenue <= 0) {
    return { scaleFactor: 1, warning: null };
  }

  const impliedSalesMultiple = marketCapUsdM / firstRevenue;
  if (marketCapUsdM >= 100_000 && firstRevenue < 10_000 && impliedSalesMultiple > 50) {
    return {
      scaleFactor: 1000,
      warning:
        "Forecast revenue appears to be expressed in USD billions; converted to USD millions before valuation. Review this normalization before relying on the output.",
    };
  }

  return { scaleFactor: 1, warning: null };
}

function buildDecision(impliedUpsidePct: number | null, warnings: string[]): DcfDecision {
  if (impliedUpsidePct === null) {
    return {
      action: "INSUFFICIENT_DATA",
      label: "Insufficient Market Data",
      summary: "Market capitalization is unavailable, so the model cannot compare intrinsic value to current market value.",
    };
  }

  const reviewText = warnings.length > 0 ? " Review the audit warnings before acting." : "";
  if (impliedUpsidePct >= 15) {
    return {
      action: "BUY",
      label: "Model Signal: Buy / Accumulate",
      summary: `The DCF equity value is ${impliedUpsidePct.toFixed(1)}% above current market value, suggesting the stock is undervalued under these assumptions.${reviewText}`,
    };
  }

  if (impliedUpsidePct <= -10) {
    return {
      action: "AVOID",
      label: "Model Signal: Avoid / Do Not Buy",
      summary: `The DCF equity value is ${Math.abs(impliedUpsidePct).toFixed(1)}% below current market value, suggesting the stock is overvalued under these assumptions.${reviewText}`,
    };
  }

  return {
    action: "WATCH",
    label: "Model Signal: Watch / Hold",
    summary: `The DCF equity value is within ${Math.abs(impliedUpsidePct).toFixed(1)}% of current market value, so the decision is not compelling without a stronger margin of safety.${reviewText}`,
  };
}
