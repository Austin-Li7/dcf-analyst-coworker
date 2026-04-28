const MIN_FISCAL_YEAR = 2000;
const MAX_FISCAL_YEAR = 2100;

function isFiscalYear(value: number): boolean {
  return Number.isInteger(value) && value >= MIN_FISCAL_YEAR && value <= MAX_FISCAL_YEAR;
}

export function normalizeFiscalYearSelection(years: Iterable<number>, maxYears = 5): number[] {
  const unique = Array.from(new Set(Array.from(years).filter(isFiscalYear))).sort((a, b) => a - b);
  return unique.slice(Math.max(0, unique.length - maxYears));
}

export function detectFiscalYearsFromText(text: string, maxYears = 5): number[] {
  const matches = text.match(/\b(?:FY\s*)?(?:20\d{2}|2100)\b/gi) ?? [];
  return normalizeFiscalYearSelection(
    matches.map((match) => Number(match.replace(/FY\s*/i, ""))),
    maxYears,
  );
}

export function detectFiscalYearsFromRecords(
  records: Array<Record<string, unknown>>,
  maxYears = 5,
): number[] {
  const yearLikeKeys = new Set([
    "fiscal_year",
    "fiscalyear",
    "fiscal year",
    "year",
    "fy",
    "target_year",
    "targetyear",
  ]);

  const years: number[] = [];

  for (const record of records) {
    for (const [key, value] of Object.entries(record)) {
      const normalizedKey = key.trim().toLowerCase().replace(/[_-]/g, " ");
      const compactKey = normalizedKey.replace(/\s+/g, "");
      const shouldInspect =
        yearLikeKeys.has(normalizedKey) ||
        yearLikeKeys.has(compactKey) ||
        normalizedKey.includes("fiscal year");

      if (!shouldInspect) continue;

      if (typeof value === "number") {
        years.push(value);
      } else if (typeof value === "string") {
        years.push(...detectFiscalYearsFromText(value, Number.MAX_SAFE_INTEGER));
      }
    }
  }

  return normalizeFiscalYearSelection(years, maxYears);
}

export function mergeHistoryYears(existingYears: number[], incomingYears: number[]): number[] {
  return normalizeFiscalYearSelection([...existingYears, ...incomingYears], Number.MAX_SAFE_INTEGER);
}
