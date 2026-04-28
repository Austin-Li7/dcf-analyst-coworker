// =============================================================================
// Module 2: Discount Rate (WACC) — Type Definitions
// =============================================================================

/** Raw data returned by GET /api/wacc-data */
export interface WACCDataResponse {
  ticker: string;
  companyName: string;
  marketCap: number;          // USD
  currentPrice?: number;      // USD per share
  sharesOutstanding?: number; // shares
  totalCash?: number;         // USD
  totalDebt: number;          // USD
  interestExpense: number;    // USD (annual)
  riskFreeRate: number;       // decimal (e.g., 0.0428 for 4.28%)
  companyDescription: string; // For conglomerate detection
  error?: string;
}

/** A single segment row for conglomerate beta calculation */
export interface WACCSegmentRow {
  id: string;
  name: string;
  unleveredBeta: number;
  estimatedValue: number;   // USD millions
}

/** Editable constants with defaults */
export interface WACCConstants {
  riskFreeRate: number;     // decimal (default from ^TNX or 0.0428)
  impliedERP: number;       // decimal (default 0.0451)
  marginalTaxRate: number;  // decimal (default 0.21)
}

/** Full WACC calculation breakdown */
export interface WACCCalculation {
  deRatio: number;            // D/E ratio
  unleveredBeta: number;      // weighted or single
  releveredBeta: number;      // Hamada output
  costOfEquity: number;       // decimal
  preTaxCostOfDebt: number;   // decimal
  afterTaxCostOfDebt: number; // decimal
  weightEquity: number;       // 0–1
  weightDebt: number;         // 0–1
  wacc: number;               // decimal (final WACC)
}

/** Business type toggle */
export type BusinessType = "single" | "conglomerate";

/** Global state for Step 7 */
export interface WACCState {
  fetchedData: WACCDataResponse | null;
  constants: WACCConstants;
  businessType: BusinessType;
  singleBeta: number;                   // used when businessType === "single"
  segments: WACCSegmentRow[];            // used when businessType === "conglomerate"
  calculation: WACCCalculation | null;
  saved: boolean;
}
