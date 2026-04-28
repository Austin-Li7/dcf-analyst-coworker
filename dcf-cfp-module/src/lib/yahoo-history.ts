import type { Step2StructuredResult } from "@/types/cfp";

type YahooAnnualFundamental = {
  date?: Date | string;
  totalRevenue?: number;
  operatingIncome?: number;
  totalOperatingIncomeAsReported?: number;
  EBIT?: number;
  operatingCashFlow?: number;
  freeCashFlow?: number;
  capitalExpenditure?: number;
  totalDebt?: number;
  cashCashEquivalentsAndShortTermInvestments?: number;
  cashAndCashEquivalents?: number;
  ordinarySharesNumber?: number;
};

function usdMillions(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round((value / 1_000_000) * 10) / 10
    : null;
}

function fiscalYearFromDate(value: unknown): number | null {
  const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date.getUTCFullYear();
}

export function buildYahooStep2StructuredResults(params: {
  ticker: string;
  companyName: string;
  annualFundamentals: YahooAnnualFundamental[];
}): Step2StructuredResult[] {
  const cleanTicker = params.ticker.trim().toUpperCase();
  const sourceId = `source:yahoo:${cleanTicker.toLowerCase()}:fundamentals`;
  const annualRows = params.annualFundamentals
    .map((row) => ({ row, fiscalYear: fiscalYearFromDate(row.date) }))
    .filter((entry): entry is { row: YahooAnnualFundamental; fiscalYear: number } => entry.fiscalYear !== null)
    .sort((a, b) => a.fiscalYear - b.fiscalYear)
    .slice(-5);

  return annualRows.map(({ row, fiscalYear }) => {
    const revenue = usdMillions(row.totalRevenue);
    const operatingIncome = usdMillions(
      row.operatingIncome ?? row.totalOperatingIncomeAsReported ?? row.EBIT,
    );
    const operatingCashFlow = usdMillions(row.operatingCashFlow);
    const freeCashFlow = usdMillions(row.freeCashFlow);
    const capex = usdMillions(row.capitalExpenditure);
    const cash = usdMillions(
      row.cashCashEquivalentsAndShortTermInvestments ?? row.cashAndCashEquivalents,
    );
    const debt = usdMillions(row.totalDebt);
    const shares = usdMillions(row.ordinarySharesNumber);
    const rowId = `yahoo:${cleanTicker.toLowerCase()}:${fiscalYear}:total-company`;

    return {
      schema_version: "v5.5",
      company_name: params.companyName || cleanTicker,
      target_year: fiscalYear,
      rows: [
        {
          row_id: rowId,
          fiscal_year: fiscalYear,
          quarter: "Q4",
          segment: "Total Company",
          product_category: "Total Company",
          product_name: "Total Company",
          revenue_usd_m: revenue,
          operating_income_usd_m: operatingIncome,
          mapped_from_step1_ids: ["consolidated:yahoo-finance"],
          source_id: sourceId,
          evidence_level: "DISCLOSED",
          validation_status: "verified_source",
          review_note:
            "Yahoo Finance annual fundamentals provide consolidated company values; segment/product allocation is not available from this source.",
        },
      ],
      sources: [
        {
          source_id: sourceId,
          source_type: "yahoo_finance",
          name: `Yahoo Finance annual fundamentals (${cleanTicker})`,
          locator: `https://finance.yahoo.com/quote/${encodeURIComponent(cleanTicker)}/financials/`,
          excerpt: [
            `FY ${fiscalYear}`,
            revenue === null ? null : `revenue ${revenue} USDm`,
            operatingIncome === null ? null : `operating income ${operatingIncome} USDm`,
            operatingCashFlow === null ? null : `operating cash flow ${operatingCashFlow} USDm`,
            freeCashFlow === null ? null : `free cash flow ${freeCashFlow} USDm`,
            capex === null ? null : `capex ${capex} USDm`,
            cash === null ? null : `cash/ST investments ${cash} USDm`,
            debt === null ? null : `debt ${debt} USDm`,
            shares === null ? null : `shares ${shares}m`,
          ].filter(Boolean).join("; "),
        },
      ],
      excluded_items: [],
      validation_warnings: [
        {
          code: "YAHOO_CONSOLIDATED_ONLY",
          severity: "info",
          message:
            "Yahoo Finance fundamentals are consolidated annual company values, not segment/product disclosures.",
          row_ids: [rowId],
        },
      ],
      review_summary: {
        one_line: `Imported FY ${fiscalYear} consolidated annual history from Yahoo Finance for ${cleanTicker}.`,
        highlights: [
          revenue === null ? "Revenue unavailable from Yahoo Finance." : `Revenue: ${revenue} USDm`,
          operatingIncome === null
            ? "Operating income unavailable from Yahoo Finance."
            : `Operating income: ${operatingIncome} USDm`,
        ],
        warnings: [
          "Use this as a consolidated baseline; segment-level Step 2 rows require company filing segment tables.",
        ],
      },
    };
  });
}
