import assert from "node:assert/strict";
import test from "node:test";
import { buildSecBootstrapPackage } from "./sec-companyfacts.ts";

test("builds a sanitized SEC bootstrap DCF package from annual company facts", () => {
  const payload = buildSecBootstrapPackage({
    ticker: "DEMO",
    cik: "0000000001",
    companyName: "Demo Corp",
    companyFacts: {
      cik: 1,
      entityName: "Demo Corp",
      facts: {
        "us-gaap": {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: {
              USD: [
                { fy: 2024, fp: "FY", form: "10-K", filed: "2025-01-31", val: 10_000_000_000 },
                { fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-31", val: 11_000_000_000 },
              ],
            },
          },
          OperatingIncomeLoss: {
            units: {
              USD: [{ fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-31", val: 2_500_000_000 }],
            },
          },
          NetCashProvidedByUsedInOperatingActivities: {
            units: {
              USD: [{ fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-31", val: 2_000_000_000 }],
            },
          },
          PaymentsToAcquirePropertyPlantAndEquipment: {
            units: {
              USD: [{ fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-31", val: 300_000_000 }],
            },
          },
          CashAndCashEquivalentsAtCarryingValue: {
            units: {
              USD: [{ fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-31", val: 1_200_000_000 }],
            },
          },
          LongTermDebtNoncurrent: {
            units: {
              USD: [{ fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-31", val: 900_000_000 }],
            },
          },
        },
        dei: {
          EntityCommonStockSharesOutstanding: {
            units: {
              shares: [{ fy: 2025, fp: "FY", form: "10-K", filed: "2026-01-31", val: 100_000_000 }],
            },
          },
        },
      },
    },
  });

  assert.equal(payload.schema_version, "sec_bootstrap_v1");
  assert.equal(payload.company.ticker, "DEMO");
  assert.equal(payload.historical_annual_dcf_drivers.length, 2);
  assert.equal(payload.normalized_base_year?.revenue_usd_m, 11_000);
  assert.equal(payload.normalized_base_year?.free_cash_flow_usd_m, 1_700);
  assert.equal(payload.normalized_base_year?.common_shares_outstanding_m, 100);
  assert.equal(payload.historical_quarterly_baseline.rows[1].quarter, "Q4");
  assert.equal(payload.minimum_dcf_readiness_checklist.has_revenue, true);
});
