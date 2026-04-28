import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";

// =============================================================================
// GET /api/earnings-date?companyName=Apple+Inc.
// =============================================================================

interface EarningsDateResponse {
  earningsDate: string | null;
  ticker: string | null;
  error?: string;
}

// Singleton — suppress the survey notice
const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export async function GET(req: NextRequest): Promise<NextResponse<EarningsDateResponse>> {
  try {
    const { searchParams } = new URL(req.url);
    const companyName = searchParams.get("companyName");

    if (!companyName || !companyName.trim()) {
      return NextResponse.json(
        { earningsDate: null, ticker: null, error: "companyName query parameter is required." },
        { status: 400 },
      );
    }

    // Step 1: Search for the ticker
    let ticker: string | null = null;

    try {
      const searchResults = await yf.search(companyName.trim());
      const quote = searchResults.quotes?.find(
        (q: Record<string, unknown>) => q.quoteType === "EQUITY" && q.symbol,
      );
      if (quote && typeof quote === "object" && "symbol" in quote) {
        ticker = String(quote.symbol);
      }
    } catch {
      // Search failed — try using the name as a ticker directly
      ticker = companyName.trim().toUpperCase().split(/\s+/)[0];
    }

    if (!ticker) {
      return NextResponse.json({ earningsDate: null, ticker: null, error: "Could not resolve ticker." });
    }

    // Step 2: Get calendar events for earnings date
    let earningsDate: string | null = null;

    try {
      const summary = await yf.quoteSummary(ticker, {
        modules: ["calendarEvents"],
      });

      const earnings = summary.calendarEvents?.earnings;
      if (earnings && earnings.earningsDate) {
        const dates = earnings.earningsDate;
        if (Array.isArray(dates) && dates.length > 0) {
          const now = new Date();
          const upcoming = dates
            .map((d: string | Date) => new Date(d))
            .filter((d: Date) => d >= now)
            .sort((a: Date, b: Date) => a.getTime() - b.getTime());
          earningsDate = upcoming.length > 0
            ? upcoming[0].toISOString()
            : new Date(dates[0] as string | Date).toISOString();
        }
      }
    } catch {
      // Calendar events not available — return null gracefully
    }

    return NextResponse.json({ earningsDate, ticker });
  } catch (err: unknown) {
    console.error("[earnings-date] Error:", err);
    const msg = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ earningsDate: null, ticker: null, error: msg }, { status: 500 });
  }
}
