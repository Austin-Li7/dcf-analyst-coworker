import { NextRequest, NextResponse } from "next/server";
import { buildSecBootstrapPackage } from "@/lib/sec-companyfacts";

type SecTickerIndex = Record<
  string,
  {
    cik_str: number;
    ticker: string;
    title: string;
  }
>;

const SEC_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json";

function secHeaders(): HeadersInit {
  return {
    "User-Agent":
      process.env.SEC_USER_AGENT ??
      "AI DCF Workflow Portfolio Demo; set SEC_USER_AGENT for production use",
    Accept: "application/json",
  };
}

function padCik(cik: number | string): string {
  return String(cik).padStart(10, "0");
}

function normalizeSearchText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const rawQuery = searchParams.get("ticker") ?? searchParams.get("query");
    const query = rawQuery?.trim();

    if (!query) {
      return NextResponse.json({ error: "Ticker or company query is required." }, { status: 400 });
    }

    const tickerResponse = await fetch(SEC_TICKERS_URL, {
      headers: secHeaders(),
      next: { revalidate: 60 * 60 * 24 },
    });

    if (!tickerResponse.ok) {
      return NextResponse.json(
        { error: `SEC ticker index request failed with ${tickerResponse.status}.` },
        { status: 502 },
      );
    }

    const tickerIndex = (await tickerResponse.json()) as SecTickerIndex;
    const normalizedQuery = normalizeSearchText(query);
    const match = Object.values(tickerIndex).find((entry) => entry.ticker.toUpperCase() === query.toUpperCase())
      ?? Object.values(tickerIndex).find((entry) =>
        normalizeSearchText(entry.title).includes(normalizedQuery),
      );

    if (!match) {
      return NextResponse.json({ error: `No SEC ticker mapping found for ${query}.` }, { status: 404 });
    }

    const ticker = match.ticker.toUpperCase();
    const cik = padCik(match.cik_str);
    const factsUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`;
    const factsResponse = await fetch(factsUrl, {
      headers: secHeaders(),
      next: { revalidate: 60 * 60 * 12 },
    });

    if (!factsResponse.ok) {
      return NextResponse.json(
        { error: `SEC company facts request failed with ${factsResponse.status}.` },
        { status: 502 },
      );
    }

    const packagePayload = buildSecBootstrapPackage({
      ticker,
      cik,
      companyName: match.title,
      companyFacts: await factsResponse.json(),
    });

    return NextResponse.json(packagePayload);
  } catch (error) {
    console.error("[bootstrap-company] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unexpected bootstrap error." },
      { status: 500 },
    );
  }
}
