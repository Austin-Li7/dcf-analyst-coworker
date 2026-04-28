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

export type AssumptionAuditSeverity = "pass" | "review" | "high";

export interface AssumptionAuditItem {
  id: string;
  label: string;
  severity: AssumptionAuditSeverity;
  summary: string;
  detail: string;
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
  assumptionAudit: AssumptionAuditItem[];
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

  const assumptionAudit = buildAssumptionAudit({
    forecast,
    forecastRows,
    fcfMargin,
    terminalGrowth,
    discountRate,
    terminalPresentValueUsdM,
    enterpriseValueUsdM,
    marketCapUsdM,
    sharesOutstandingM,
    warnings,
  });

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
    decision: buildDecision(roundedUpside, warnings, assumptionAudit),
    warnings,
    assumptionAudit,
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
    assumptionAudit: warnings.map((warning, index) => ({
      id: `missing-input-${index + 1}`,
      label: "Missing valuation input",
      severity: "high",
      summary: warning,
      detail: "Complete the required upstream workflow step before relying on the valuation dashboard.",
    })),
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

function buildDecision(
  impliedUpsidePct: number | null,
  warnings: string[],
  assumptionAudit: AssumptionAuditItem[],
): DcfDecision {
  if (impliedUpsidePct === null) {
    return {
      action: "INSUFFICIENT_DATA",
      label: "Insufficient Market Data",
      summary: "Market capitalization is unavailable, so the model cannot compare intrinsic value to current market value.",
    };
  }

  const hasHighRisk = assumptionAudit.some((item) => item.severity === "high");
  const hasReviewRisk = assumptionAudit.some((item) => item.severity === "review");
  const reviewText =
    warnings.length > 0 || hasHighRisk || hasReviewRisk
      ? " Review the assumption audit before acting."
      : "";
  const riskPrefix = hasHighRisk ? "High-risk audit flags are present. " : "";
  if (impliedUpsidePct >= 15) {
    return {
      action: "BUY",
      label: "Model Signal: Buy / Accumulate",
      summary: `${riskPrefix}The DCF equity value is ${impliedUpsidePct.toFixed(1)}% above current market value, suggesting the stock is undervalued under these assumptions.${reviewText}`,
    };
  }

  if (impliedUpsidePct <= -10) {
    return {
      action: "AVOID",
      label: "Model Signal: Avoid / Do Not Buy",
      summary: `${riskPrefix}The DCF equity value is ${Math.abs(impliedUpsidePct).toFixed(1)}% below current market value, suggesting the stock is overvalued under these assumptions.${reviewText}`,
    };
  }

  return {
    action: "WATCH",
    label: "Model Signal: Watch / Hold",
    summary: `${riskPrefix}The DCF equity value is within ${Math.abs(impliedUpsidePct).toFixed(1)}% of current market value, so the decision is not compelling without a stronger margin of safety.${reviewText}`,
  };
}

function buildAssumptionAudit({
  forecast,
  forecastRows,
  fcfMargin,
  terminalGrowth,
  discountRate,
  terminalPresentValueUsdM,
  enterpriseValueUsdM,
  marketCapUsdM,
  sharesOutstandingM,
  warnings,
}: {
  forecast: ForecastState;
  forecastRows: DcfForecastValueRow[];
  fcfMargin: number;
  terminalGrowth: number;
  discountRate: number;
  terminalPresentValueUsdM: number;
  enterpriseValueUsdM: number;
  marketCapUsdM: number | null;
  sharesOutstandingM: number | null;
  warnings: string[];
}): AssumptionAuditItem[] {
  const artifacts = forecast.structuredResults ?? [];
  const confidenceSummaries = artifacts.map((artifact) => artifact.machine_artifact.confidence_summary);
  const weakDriverPct = Math.max(0, ...confidenceSummaries.map((summary) => summary.weak_driver_revenue_pct));
  const highUncertaintyFlags = confidenceSummaries.reduce(
    (sum, summary) => sum + summary.high_uncertainty_flags,
    0,
  );
  const weakSensitivityRows = artifacts.flatMap(
    (artifact) => artifact.machine_artifact.weak_inference_sensitivity,
  );
  const terminalPvShare =
    enterpriseValueUsdM > 0 ? (terminalPresentValueUsdM / enterpriseValueUsdM) * 100 : 0;
  const waccGrowthSpread = discountRate - terminalGrowth;
  const revenueCagr = forecastRows.length >= 2
    ? Math.pow(forecastRows.at(-1)!.revenueUsdM / forecastRows[0].revenueUsdM, 1 / (forecastRows.length - 1)) - 1
    : 0;

  return [
    {
      id: "wacc-growth-spread",
      label: "WACC vs terminal growth spread",
      severity: waccGrowthSpread < 0.015 ? "high" : waccGrowthSpread < 0.025 ? "review" : "pass",
      summary: `${(waccGrowthSpread * 100).toFixed(1)} percentage point spread`,
      detail:
        waccGrowthSpread < 0.015
          ? "Terminal value is extremely sensitive because WACC is too close to terminal growth."
          : waccGrowthSpread < 0.025
            ? "Spread is narrow; review whether terminal growth is too optimistic or WACC is too low."
            : "Spread is wide enough for a stable base-case valuation.",
    },
    {
      id: "terminal-value-dependence",
      label: "Terminal value dependence",
      severity: terminalPvShare > 85 ? "high" : terminalPvShare > 75 ? "review" : "pass",
      summary: `${terminalPvShare.toFixed(1)}% of enterprise value from terminal PV`,
      detail:
        terminalPvShare > 85
          ? "The valuation is dominated by terminal value; small long-term assumption changes can overwhelm the explicit forecast."
          : terminalPvShare > 75
            ? "Terminal value is a large share of enterprise value; validate the terminal growth and steady-state margin carefully."
            : "Explicit forecast cash flows contribute a meaningful share of enterprise value.",
    },
    {
      id: "fcf-margin",
      label: "FCF margin assumption",
      severity: fcfMargin > 0.35 || fcfMargin < 0.05 ? "high" : fcfMargin > 0.28 || fcfMargin < 0.12 ? "review" : "pass",
      summary: `${(fcfMargin * 100).toFixed(1)}% FCF margin`,
      detail:
        fcfMargin > 0.35 || fcfMargin < 0.05
          ? "FCF margin is outside a typical base-case range; verify it against historical conversion and business model economics."
          : fcfMargin > 0.28 || fcfMargin < 0.12
            ? "FCF margin is aggressive or conservative enough to merit a manual reasonableness check."
            : "FCF margin is within the default review band.",
    },
    {
      id: "forecast-growth",
      label: "Forecast growth profile",
      severity: revenueCagr > 0.2 || revenueCagr < -0.05 ? "high" : revenueCagr > 0.12 || revenueCagr < 0 ? "review" : "pass",
      summary: `${(revenueCagr * 100).toFixed(1)}% 5-year revenue CAGR`,
      detail:
        revenueCagr > 0.2 || revenueCagr < -0.05
          ? "Forecast growth is extreme for a base case; validate the segment assumptions and source support."
          : revenueCagr > 0.12 || revenueCagr < 0
            ? "Forecast growth is meaningfully above or below steady-state expectations; review the supporting assumptions."
            : "Forecast growth is within the default review band.",
    },
    {
      id: "weak-driver-exposure",
      label: "Weak inference exposure",
      severity: weakDriverPct > 25 || highUncertaintyFlags > 2 ? "high" : weakDriverPct > 10 || highUncertaintyFlags > 0 ? "review" : "pass",
      summary: `${weakDriverPct.toFixed(1)}% weak-driver FY5 revenue; ${highUncertaintyFlags} high-uncertainty flag(s)`,
      detail:
        weakDriverPct > 25 || highUncertaintyFlags > 2
          ? "A large share of the forecast depends on weak or uncertain drivers; treat the valuation as exploratory."
          : weakDriverPct > 10 || highUncertaintyFlags > 0
            ? "Some forecast support is weak; review Step 5 assumptions before using the valuation."
            : "Step 5 confidence summary does not show material weak-driver exposure.",
    },
    {
      id: "weak-sensitivity",
      label: "Weak-assumption sensitivity",
      severity: weakSensitivityRows.some((row) => Math.abs(row.fy5_impact_pct) > 10)
        ? "high"
        : weakSensitivityRows.some((row) => Math.abs(row.fy5_impact_pct) > 5)
          ? "review"
          : "pass",
      summary: `${weakSensitivityRows.length} weak sensitivity row(s)`,
      detail:
        weakSensitivityRows.length === 0
          ? "No weak-inference sensitivity rows were reported by Step 5."
          : "Review weak-inference sensitivity rows before treating the base case as durable.",
    },
    {
      id: "market-bridge",
      label: "Market bridge completeness",
      severity: !marketCapUsdM || !sharesOutstandingM || warnings.length > 0 ? "review" : "pass",
      summary: marketCapUsdM && sharesOutstandingM ? "Market cap and share count available" : "Market bridge incomplete",
      detail:
        !marketCapUsdM || !sharesOutstandingM
          ? "Market cap or shares outstanding are missing, limiting per-share and upside/downside interpretation."
          : warnings.length > 0
            ? "Valuation warnings affect the bridge from enterprise value to equity value."
            : "Market bridge has enough data for per-share and market-cap comparison.",
    },
  ];
}
