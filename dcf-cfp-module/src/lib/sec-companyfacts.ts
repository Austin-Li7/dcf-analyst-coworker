export type SecBootstrapFact = {
  fiscal_year: number;
  revenue_usd_m: number | null;
  operating_income_usd_m: number | null;
  operating_cash_flow_usd_m: number | null;
  capex_usd_m: number | null;
  free_cash_flow_usd_m: number | null;
  cash_and_marketable_securities_usd_m: number | null;
  total_debt_usd_m: number | null;
  common_shares_outstanding_m: number | null;
};

export type SecBusinessArchitectureCandidate = {
  name: string;
  category: string;
  products: string[];
  customer_type: string;
  evidence_level: "DISCLOSED" | "STRONG_INFERENCE";
  source_snippet: string;
  source_location: string;
};

export type SecBootstrapPackage = {
  schema_version: "sec_bootstrap_v1";
  company: {
    name: string;
    ticker: string;
    cik: string;
  };
  source_manifest: Array<{
    source_id: string;
    source_type: "sec_companyfacts" | "sec_filing_html";
    name: string;
    locator: string;
  }>;
  business_architecture_evidence?: {
    latest_annual_report: {
      form: string;
      filing_date: string;
      report_date: string;
      url: string;
    };
    business_excerpt: string;
    revenue_category_candidates: SecBusinessArchitectureCandidate[];
  };
  historical_quarterly_baseline: {
    rows: Array<{
      fiscal_year: number;
      quarter: "Q4";
      segment: "Total Company";
      product_category: "Total Company";
      product_name: "Total Company";
      revenue_usd_m: number | null;
      operating_income_usd_m: number | null;
      source_name: string;
      source_url: string;
      review_note: string;
    }>;
  };
  historical_annual_dcf_drivers: SecBootstrapFact[];
  normalized_base_year: SecBootstrapFact | null;
  minimum_dcf_readiness_checklist: {
    has_revenue: boolean;
    has_operating_income: boolean;
    has_cash_flow_or_fcf: boolean;
    has_balance_sheet_bridge: boolean;
  };
  warnings: string[];
};

type SecCompanyFacts = {
  cik: number;
  entityName: string;
  facts?: {
    "us-gaap"?: Record<string, SecFact>;
    dei?: Record<string, SecFact>;
  };
};

type SecFact = {
  label?: string;
  units?: Record<string, SecFactUnit[]>;
};

type SecFactUnit = {
  start?: string;
  end?: string;
  val?: number;
  fy?: number;
  fp?: string;
  form?: string;
  filed?: string;
  frame?: string;
};

type LatestAnnualReportInput = {
  form: string;
  filingDate: string;
  reportDate: string;
  url: string;
  html: string;
};

const REVENUE_CONCEPTS = [
  "RevenueFromContractWithCustomerExcludingAssessedTax",
  "Revenues",
  "SalesRevenueNet",
];

const OPERATING_INCOME_CONCEPTS = ["OperatingIncomeLoss"];
const OPERATING_CASH_FLOW_CONCEPTS = ["NetCashProvidedByUsedInOperatingActivities"];
const CAPEX_CONCEPTS = ["PaymentsToAcquirePropertyPlantAndEquipment"];
const CASH_CONCEPTS = [
  "CashAndCashEquivalentsAtCarryingValue",
  "CashCashEquivalentsRestrictedCashAndRestrictedCashEquivalents",
];
const DEBT_CURRENT_CONCEPTS = ["ShortTermBorrowings", "ShortTermDebtCurrent"];
const DEBT_NONCURRENT_CONCEPTS = ["LongTermDebtNoncurrent", "LongTermDebtAndFinanceLeaseObligationsNoncurrent"];
const SHARES_CONCEPTS = ["EntityCommonStockSharesOutstanding"];

const PRODUCT_CATEGORY_PATTERNS = [
  {
    name: "iPhone",
    category: "Hardware",
    customerType: "Consumer",
    products: ["iPhone"],
  },
  {
    name: "Mac",
    category: "Hardware",
    customerType: "Consumer and Enterprise",
    products: ["MacBook Air", "MacBook Pro", "iMac", "Mac mini", "Mac Studio", "Mac Pro"],
  },
  {
    name: "iPad",
    category: "Hardware",
    customerType: "Consumer and Enterprise",
    products: ["iPad Pro", "iPad Air", "iPad", "iPad mini"],
  },
  {
    name: "Wearables, Home and Accessories",
    category: "Hardware and Accessories",
    customerType: "Consumer",
    products: ["Apple Watch", "AirPods", "Apple TV", "HomePod", "Vision Pro"],
  },
  {
    name: "Services",
    category: "Services",
    customerType: "Consumer and Enterprise",
    products: ["Advertising", "AppleCare", "Cloud services", "Digital content", "Payment services"],
  },
];

function usdMillions(value: number | null): number | null {
  return value === null ? null : Math.round((value / 1_000_000) * 10) / 10;
}

function sharesMillions(value: number | null): number | null {
  return value === null ? null : Math.round((value / 1_000_000) * 10) / 10;
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;|&#160;/g, " ")
    .replace(/&#8217;|&rsquo;/g, "'")
    .replace(/&#8220;|&ldquo;/g, '"')
    .replace(/&#8221;|&rdquo;/g, '"')
    .replace(/&#8211;|&ndash;/g, "-")
    .replace(/&#8212;|&mdash;/g, "-")
    .replace(/&#174;|&reg;/g, "")
    .replace(/&#8482;|&trade;/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function htmlToPlainText(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  ).replace(/\s+/g, " ").trim();
}

function excerptAround(text: string, needle: string, radius = 420): string | null {
  const index = text.toLowerCase().indexOf(needle.toLowerCase());
  if (index < 0) return null;
  return text.slice(Math.max(0, index - radius), index + needle.length + radius).trim();
}

function extractBusinessArchitectureEvidence(
  annualReport: LatestAnnualReportInput | undefined,
): SecBootstrapPackage["business_architecture_evidence"] | undefined {
  if (!annualReport?.html) return undefined;

  const plainText = htmlToPlainText(annualReport.html);
  const businessExcerpt =
    excerptAround(plainText, "Company Background", 1800) ??
    excerptAround(plainText, "Products iPhone", 1800) ??
    excerptAround(plainText, "Item 1. Business", 1800) ??
    "";

  const candidates = PRODUCT_CATEGORY_PATTERNS.flatMap((pattern) => {
    const snippet =
      excerptAround(businessExcerpt, pattern.name, 360) ??
      excerptAround(plainText, pattern.name, 360);
    if (!snippet) return [];
    return [
      {
        name: pattern.name,
        category: pattern.category,
        products: pattern.products,
        customer_type: pattern.customerType,
        evidence_level: "DISCLOSED" as const,
        source_snippet: snippet.slice(0, 900),
        source_location: `${annualReport.form} filed ${annualReport.filingDate}, Item 1 Business`,
      },
    ];
  });

  if (!businessExcerpt && candidates.length === 0) return undefined;

  return {
    latest_annual_report: {
      form: annualReport.form,
      filing_date: annualReport.filingDate,
      report_date: annualReport.reportDate,
      url: annualReport.url,
    },
    business_excerpt: businessExcerpt.slice(0, 5000),
    revenue_category_candidates: candidates,
  };
}

function annualFacts(fact: SecFact | undefined, unit = "USD"): SecFactUnit[] {
  const rows = fact?.units?.[unit] ?? [];
  return rows
    .filter((row) => {
      const isAnnual = row.fp === "FY" || row.frame?.startsWith("CY");
      const isFiling = row.form === "10-K" || row.form === "10-K/A";
      return isAnnual && isFiling && typeof row.fy === "number" && typeof row.val === "number";
    })
    .sort((a, b) => String(a.filed ?? "").localeCompare(String(b.filed ?? "")));
}

function latestAnnualValue(
  facts: SecCompanyFacts,
  concepts: string[],
  fiscalYear: number,
  unit = "USD",
): number | null {
  const gaapFacts = facts.facts?.["us-gaap"] ?? {};
  const deiFacts = facts.facts?.dei ?? {};
  const allFacts = { ...gaapFacts, ...deiFacts };

  for (const concept of concepts) {
    const rows = annualFacts(allFacts[concept], unit).filter((row) => row.fy === fiscalYear);
    const latest = rows.at(-1);
    if (typeof latest?.val === "number") {
      return latest.val;
    }
  }

  return null;
}

function discoveredFiscalYears(facts: SecCompanyFacts): number[] {
  const gaapFacts = facts.facts?.["us-gaap"] ?? {};
  const years = new Set<number>();

  for (const concept of REVENUE_CONCEPTS) {
    for (const row of annualFacts(gaapFacts[concept])) {
      if (typeof row.fy === "number") years.add(row.fy);
    }
  }

  return [...years].sort((a, b) => a - b).slice(-5);
}

export function buildSecBootstrapPackage(params: {
  ticker: string;
  cik: string;
  companyName: string;
  companyFacts: SecCompanyFacts;
  latestAnnualReport?: LatestAnnualReportInput;
}): SecBootstrapPackage {
  const fiscalYears = discoveredFiscalYears(params.companyFacts);
  const warnings: string[] = [];

  if (fiscalYears.length === 0) {
    warnings.push("No annual revenue facts were found in SEC Company Facts.");
  }

  const drivers = fiscalYears.map((fiscalYear): SecBootstrapFact => {
    const revenue = latestAnnualValue(params.companyFacts, REVENUE_CONCEPTS, fiscalYear);
    const operatingIncome = latestAnnualValue(
      params.companyFacts,
      OPERATING_INCOME_CONCEPTS,
      fiscalYear,
    );
    const operatingCashFlow = latestAnnualValue(
      params.companyFacts,
      OPERATING_CASH_FLOW_CONCEPTS,
      fiscalYear,
    );
    const capex = latestAnnualValue(params.companyFacts, CAPEX_CONCEPTS, fiscalYear);
    const cash = latestAnnualValue(params.companyFacts, CASH_CONCEPTS, fiscalYear);
    const debtCurrent = latestAnnualValue(params.companyFacts, DEBT_CURRENT_CONCEPTS, fiscalYear);
    const debtNoncurrent = latestAnnualValue(
      params.companyFacts,
      DEBT_NONCURRENT_CONCEPTS,
      fiscalYear,
    );
    const shares = latestAnnualValue(params.companyFacts, SHARES_CONCEPTS, fiscalYear, "shares");
    const totalDebt =
      debtCurrent === null && debtNoncurrent === null
        ? null
        : (debtCurrent ?? 0) + (debtNoncurrent ?? 0);

    return {
      fiscal_year: fiscalYear,
      revenue_usd_m: usdMillions(revenue),
      operating_income_usd_m: usdMillions(operatingIncome),
      operating_cash_flow_usd_m: usdMillions(operatingCashFlow),
      capex_usd_m: usdMillions(capex),
      free_cash_flow_usd_m:
        operatingCashFlow === null || capex === null ? null : usdMillions(operatingCashFlow - capex),
      cash_and_marketable_securities_usd_m: usdMillions(cash),
      total_debt_usd_m: usdMillions(totalDebt),
      common_shares_outstanding_m: sharesMillions(shares),
    };
  });

  const baseYear = drivers.at(-1) ?? null;
  const secUrl = `https://data.sec.gov/api/xbrl/companyfacts/CIK${params.cik}.json`;
  const businessArchitectureEvidence = extractBusinessArchitectureEvidence(params.latestAnnualReport);

  return {
    schema_version: "sec_bootstrap_v1",
    company: {
      name: params.companyName,
      ticker: params.ticker,
      cik: params.cik,
    },
    source_manifest: [
      {
        source_id: "source:sec:companyfacts",
        source_type: "sec_companyfacts",
        name: "SEC Company Facts API",
        locator: secUrl,
      },
      ...(params.latestAnnualReport
        ? [
            {
              source_id: "source:sec:latest_10k",
              source_type: "sec_filing_html" as const,
              name: `${params.latestAnnualReport.form} filed ${params.latestAnnualReport.filingDate}`,
              locator: params.latestAnnualReport.url,
            },
          ]
        : []),
    ],
    ...(businessArchitectureEvidence
      ? { business_architecture_evidence: businessArchitectureEvidence }
      : {}),
    historical_quarterly_baseline: {
      rows: drivers.map((row) => ({
        fiscal_year: row.fiscal_year,
        quarter: "Q4",
        segment: "Total Company",
        product_category: "Total Company",
        product_name: "Total Company",
        revenue_usd_m: row.revenue_usd_m,
        operating_income_usd_m: row.operating_income_usd_m,
        source_name: "SEC Company Facts API",
        source_url: secUrl,
        review_note:
          "Annual SEC Company Facts value represented as Q4 Total Company baseline for review.",
      })),
    },
    historical_annual_dcf_drivers: drivers,
    normalized_base_year: baseYear,
    minimum_dcf_readiness_checklist: {
      has_revenue: drivers.some((row) => row.revenue_usd_m !== null),
      has_operating_income: drivers.some((row) => row.operating_income_usd_m !== null),
      has_cash_flow_or_fcf: drivers.some((row) => row.free_cash_flow_usd_m !== null),
      has_balance_sheet_bridge: !!baseYear?.cash_and_marketable_securities_usd_m || !!baseYear?.total_debt_usd_m,
    },
    warnings,
  };
}
