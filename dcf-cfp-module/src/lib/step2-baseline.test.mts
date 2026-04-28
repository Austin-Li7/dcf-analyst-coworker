import test from "node:test";
import assert from "node:assert/strict";

import {
  detectFiscalYearsFromRecords,
  detectFiscalYearsFromText,
  mergeHistoryYears,
  normalizeFiscalYearSelection,
} from "./step2-baseline.ts";

test("detects the latest five fiscal years from uploaded table records", () => {
  const records = [
    { fiscal_year: 2020, revenue_usd_m: 1 },
    { fiscal_year: 2021, revenue_usd_m: 2 },
    { fiscal_year: 2022, revenue_usd_m: 3 },
    { fiscal_year: 2023, revenue_usd_m: 4 },
    { fiscal_year: 2024, revenue_usd_m: 5 },
    { fiscal_year: 2025, revenue_usd_m: 6 },
  ];

  assert.deepEqual(detectFiscalYearsFromRecords(records), [2021, 2022, 2023, 2024, 2025]);
});

test("detects fiscal years from pasted text notes", () => {
  const text = "FY2021 Q1 revenue, FY2022 Q1 revenue, FY2023 Q1 revenue, FY2024 Q1, FY2025 Q4";

  assert.deepEqual(detectFiscalYearsFromText(text), [2021, 2022, 2023, 2024, 2025]);
});

test("normalizes, deduplicates, and sorts fiscal years", () => {
  assert.deepEqual(normalizeFiscalYearSelection([2025, 1999, 2024, 2025, 2101, 2023]), [
    2023,
    2024,
    2025,
  ]);
});

test("merges confirmed history years without imposing the five-year UI cap", () => {
  assert.deepEqual(mergeHistoryYears([2021, 2023], [2022, 2023, 2024]), [
    2021,
    2022,
    2023,
    2024,
  ]);
});
