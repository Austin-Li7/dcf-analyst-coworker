const COMPANY_TICKER_ALIASES: Record<string, string> = {
  "apple": "AAPL",
  "apple inc": "AAPL",
  "microsoft": "MSFT",
  "microsoft corporation": "MSFT",
  "alphabet": "GOOGL",
  "alphabet inc": "GOOGL",
  "google": "GOOGL",
  "amazon": "AMZN",
  "amazon com": "AMZN",
  "amazon.com": "AMZN",
  "meta": "META",
  "meta platforms": "META",
  "nvidia": "NVDA",
  "nvidia corporation": "NVDA",
  "tesla": "TSLA",
  "tesla inc": "TSLA",
  "berkshire hathaway": "BRK-B",
  "berkshire hathaway inc": "BRK-B",
};

export function normalizeTickerInput(value: string | null | undefined): string {
  return (value ?? "").trim().toUpperCase();
}

export function normalizeCompanyNameForTicker(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/\b(incorporated|inc|corporation|corp|company|co|limited|ltd|plc|class a|class b)\b\.?/g, "")
    .replace(/[^a-z0-9.]+/g, " ")
    .replace(/\s+\./g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferTickerFromCompanyName(companyName: string | null | undefined): string {
  const normalized = normalizeCompanyNameForTicker(companyName);
  if (!normalized) return "";

  return COMPANY_TICKER_ALIASES[normalized] ?? "";
}
