import assert from "node:assert/strict";
import test from "node:test";

import { buildYahooStep2StructuredResults } from "./yahoo-history.ts";

test("builds Step 2 structured history from Yahoo annual fundamentals", () => {
  const results = buildYahooStep2StructuredResults({
    ticker: "AAPL",
    companyName: "Apple Inc.",
    annualFundamentals: [
      {
        date: new Date("2024-09-30"),
        totalRevenue: 391_035_000_000,
        operatingIncome: 123_216_000_000,
        operatingCashFlow: 118_254_000_000,
        freeCashFlow: 108_807_000_000,
        capitalExpenditure: -9_447_000_000,
        totalDebt: 106_629_000_000,
        cashCashEquivalentsAndShortTermInvestments: 65_171_000_000,
        ordinarySharesNumber: 15_116_786_000,
      },
      {
        date: new Date("2025-09-30"),
        totalRevenue: 416_161_000_000,
        totalOperatingIncomeAsReported: 133_050_000_000,
      },
    ],
  });

  assert.equal(results.length, 2);
  assert.equal(results[1].target_year, 2025);
  assert.equal(results[1].rows[0].segment, "Total Company");
  assert.equal(results[1].rows[0].revenue_usd_m, 416_161);
  assert.equal(results[1].rows[0].operating_income_usd_m, 133_050);
  assert.equal(results[1].sources[0].source_type, "yahoo_finance");
  assert.equal(results[1].validation_warnings[0].code, "YAHOO_CONSOLIDATED_ONLY");
});
