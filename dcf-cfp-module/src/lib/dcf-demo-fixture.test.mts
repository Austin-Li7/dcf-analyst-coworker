import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const fixturePath = resolve(
  "test/fixtures/step2/apple-demo-dcf/apple-fy2021-fy2025-complete-dcf-input.json",
);

test("Apple complete DCF demo fixture contains the minimum valuation input package", () => {
  const fixture = JSON.parse(readFileSync(fixturePath, "utf8"));

  assert.equal(fixture.schema_version, "demo_dcf_input_v1");
  assert.equal(fixture.company.ticker, "AAPL");
  assert.equal(fixture.historical_quarterly_baseline.rows.length, 20);
  assert.equal(fixture.historical_annual_dcf_drivers.length, 5);

  for (const row of fixture.historical_annual_dcf_drivers) {
    assert.equal(typeof row.income_statement.revenue_usd_m, "number");
    assert.equal(typeof row.income_statement.ebit_usd_m, "number");
    assert.equal(typeof row.income_statement.effective_tax_rate, "number");
    assert.equal(typeof row.cash_flow.depreciation_amortization_usd_m, "number");
    assert.equal(typeof row.cash_flow.capital_expenditures_usd_m, "number");
    assert.equal(typeof row.cash_flow.operating_cash_flow_usd_m, "number");
    assert.equal(typeof row.cash_flow.free_cash_flow_usd_m, "number");
    assert.equal(typeof row.balance_sheet.cash_and_marketable_securities_usd_m, "number");
    assert.equal(typeof row.balance_sheet.total_debt_usd_m, "number");
    assert.equal(typeof row.share_data.common_shares_outstanding_m, "number");
  }

  assert.equal(typeof fixture.valuation_assumptions.wacc, "number");
  assert.equal(typeof fixture.valuation_assumptions.terminal_growth_rate, "number");
  assert.deepEqual(
    Object.values(fixture.minimum_dcf_readiness_checklist).every(Boolean),
    true,
  );
});
