import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import type { WACCDataResponse } from "@/types/wacc";

// =============================================================================
// GET /api/wacc-data?ticker=AAPL
// =============================================================================

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

const FALLBACK_RISK_FREE = 0.0428; // 4.28%

export async function GET(req: NextRequest): Promise<NextResponse<WACCDataResponse>> {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker");

    if (!ticker || !ticker.trim()) {
      return NextResponse.json(
        {
          ticker: "", companyName: "", marketCap: 0, totalDebt: 0,
          currentPrice: 0, sharesOutstanding: 0, totalCash: 0, interestExpense: 0, riskFreeRate: FALLBACK_RISK_FREE,
          companyDescription: "", error: "Ticker is required.",
        },
        { status: 400 },
      );
    }

    const cleanTicker = ticker.trim().toUpperCase();

    // ---- Fetch company data ----
    let marketCap = 0;
    let currentPrice = 0;
    let sharesOutstanding = 0;
    let totalCash = 0;
    let totalDebt = 0;
    let interestExpense = 0;
    let companyName = cleanTicker;
    let companyDescription = "";

    try {
      const summary = await yf.quoteSummary(cleanTicker, {
        modules: [
          "defaultKeyStatistics",
          "financialData",
          "summaryProfile",
          "incomeStatementHistory",
        ],
      });

      currentPrice = summary.financialData?.currentPrice ?? 0;
      sharesOutstanding = summary.defaultKeyStatistics?.sharesOutstanding ?? 0;

      // Market Cap
      marketCap = currentPrice && sharesOutstanding
        ? currentPrice * sharesOutstanding
        : (summary.defaultKeyStatistics?.enterpriseValue ?? 0);

      // Total Debt
      totalDebt = summary.financialData?.totalDebt ?? 0;
      totalCash = summary.financialData?.totalCash ?? 0;

      // Company description (for conglomerate detection)
      companyDescription = summary.summaryProfile?.longBusinessSummary ?? "";
      companyName = summary.summaryProfile?.industry
        ? `${cleanTicker} (${summary.summaryProfile.industry})`
        : cleanTicker;

      // Interest Expense (from most recent annual income statement)
      const statements = summary.incomeStatementHistory?.incomeStatementHistory;
      if (statements && statements.length > 0) {
        const latest = statements[0];
        // interestExpense is typically negative in Yahoo Finance
        interestExpense = Math.abs(latest.interestExpense ?? 0);
      }
    } catch (e) {
      console.warn(`[wacc-data] Could not fetch company data for ${cleanTicker}:`, e);
    }

    // ---- Fetch 10-Year Treasury Yield (^TNX) ----
    let riskFreeRate = FALLBACK_RISK_FREE;

    try {
      const tnx = await yf.quote("^TNX");
      if (tnx && typeof tnx.regularMarketPrice === "number" && tnx.regularMarketPrice > 0) {
        // ^TNX returns yield as a percentage (e.g., 4.28), convert to decimal
        riskFreeRate = tnx.regularMarketPrice / 100;
      }
    } catch {
      // Use fallback
    }

    return NextResponse.json({
      ticker: cleanTicker,
      companyName,
      marketCap,
      currentPrice,
      sharesOutstanding,
      totalCash,
      totalDebt,
      interestExpense,
      riskFreeRate,
      companyDescription,
    });
  } catch (err: unknown) {
    console.error("[wacc-data] Error:", err);
    const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json(
      {
        ticker: "", companyName: "", marketCap: 0, totalDebt: 0,
        currentPrice: 0, sharesOutstanding: 0, totalCash: 0, interestExpense: 0, riskFreeRate: FALLBACK_RISK_FREE,
        companyDescription: "", error: msg,
      },
      { status: 500 },
    );
  }
}
