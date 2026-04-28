import { NextRequest, NextResponse } from "next/server";
import YahooFinance from "yahoo-finance2";
import { buildYahooStep2StructuredResults } from "@/lib/yahoo-history";
import { projectStep2StructuredToRows } from "@/lib/step2-schema";
import type { ExtractHistoryResponse } from "@/types/cfp";

const yf = new YahooFinance({ suppressNotices: ["yahooSurvey"] });

export async function GET(req: NextRequest): Promise<NextResponse<ExtractHistoryResponse>> {
  try {
    const { searchParams } = new URL(req.url);
    const ticker = searchParams.get("ticker")?.trim().toUpperCase();
    const companyName = searchParams.get("companyName")?.trim() ?? ticker ?? "";

    if (!ticker) {
      return NextResponse.json({ rows: [], error: "Ticker is required." }, { status: 400 });
    }

    const annualFundamentals = await yf.fundamentalsTimeSeries(ticker, {
      period1: "2018-01-01",
      type: "annual",
      module: "all",
    });

    const structuredResults = buildYahooStep2StructuredResults({
      ticker,
      companyName,
      annualFundamentals,
    });

    if (structuredResults.length === 0) {
      return NextResponse.json(
        { rows: [], structuredResults: [], error: `No annual Yahoo Finance history found for ${ticker}.` },
        { status: 404 },
      );
    }

    return NextResponse.json({
      rows: structuredResults.flatMap((result) => projectStep2StructuredToRows(result)),
      structuredResults,
    });
  } catch (err: unknown) {
    console.error("[yahoo-history] Error:", err);
    const message = err instanceof Error ? err.message : "Unexpected Yahoo Finance history error.";
    return NextResponse.json({ rows: [], error: message }, { status: 500 });
  }
}
