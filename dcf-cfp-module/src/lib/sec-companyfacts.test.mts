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

test("extracts latest annual report product category evidence when filing HTML is available", () => {
  const payload = buildSecBootstrapPackage({
    ticker: "AAPL",
    cik: "0000320193",
    companyName: "Apple Inc.",
    latestAnnualReport: {
      form: "10-K",
      filingDate: "2025-10-31",
      reportDate: "2025-09-27",
      url: "https://www.sec.gov/Archives/edgar/data/320193/example.htm",
      html: `
        <html><body>
          <h1>Item 1. Business</h1>
          <p>Company Background. Products iPhone is the Company's line of smartphones.
          Mac is the Company's line of personal computers. iPad is the Company's line
          of tablets. Wearables, Home and Accessories includes smartwatches and wireless
          headphones. Services includes advertising, AppleCare, cloud services, digital
          content and payment services.</p>
        </body></html>
      `,
    },
    companyFacts: {
      cik: 320193,
      entityName: "Apple Inc.",
      facts: {
        "us-gaap": {
          RevenueFromContractWithCustomerExcludingAssessedTax: {
            units: {
              USD: [
                { fy: 2025, fp: "FY", form: "10-K", filed: "2025-10-31", val: 416_161_000_000 },
              ],
            },
          },
        },
      },
    },
  });

  assert.equal(payload.business_architecture_evidence?.latest_annual_report.form, "10-K");
  assert.deepEqual(
    payload.business_architecture_evidence?.revenue_category_candidates.map((candidate) => candidate.name),
    ["iPhone", "Mac", "iPad", "Wearables, Home and Accessories", "Services"],
  );
  assert.equal(payload.source_manifest.at(-1)?.source_type, "sec_filing_html");
});
