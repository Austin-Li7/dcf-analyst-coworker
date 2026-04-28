// =============================================================================
// CFP Module — Master Type Definitions
// =============================================================================

// ---------------------------------------------------------------------------
// Global Settings (LLM Provider & API Keys)
// ---------------------------------------------------------------------------
export type LLMProvider = "claude" | "gemini";

export interface SettingsState {
  llmProvider: LLMProvider;
  claudeApiKey: string;
  geminiApiKey: string;
}

/** Identifies one fiscal quarter (e.g. Q1 2025). */
export interface FiscalQuarter {
  year: number;
  quarter: 1 | 2 | 3 | 4;
}

// ---------------------------------------------------------------------------
// Step 1 – Company Profile & Business Architecture Analysis
// ---------------------------------------------------------------------------
export interface CompanyProfile {
  ticker: string;
  companyName: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  currency: string;
  fiscalYearEnd: string; // e.g. "December"
  lastUpdated: string | null; // ISO date

  // Step 1 analysis output (populated after Anthropic call)
  rawAnalysisMarkdown: string; // full markdown from the LLM
  step1StructuredResult: Step1StructuredResult | null; // validated source of truth
  architectureJson: BusinessArchitecture | null; // parsed JSON block
  step1Review: Step1ReviewState | null;
}

/** Parsed from Part 3 of the LLM response. */
export interface BusinessArchitecture {
  architecture: SegmentArchitectureEntry[];
  sources: ArchitectureSource[];
}

export interface SegmentArchitectureEntry {
  segment: string;
  businessLines: BusinessLine[];
}

export interface BusinessLine {
  name: string;
  products: string[];
  customerType: string;
  dataSource: string;
}

export interface ArchitectureSource {
  document: string;
  section: string;
  page?: string;
}

export type Step1EvidenceLevel =
  | "DISCLOSED"
  | "STRONG_INFERENCE"
  | "WEAK_INFERENCE"
  | "UNSUPPORTED";

export type Step1ReportedViewType =
  | "operating_segment"
  | "revenue_category"
  | "geography"
  | "mixed";

export interface Step1Source {
  document: string;
  section: string;
  page?: string;
}

export interface Step1Claim {
  claim_id: string;
  text: string;
  source_snippet: string | null;
  source_location: string | null;
  evidence_level: Step1EvidenceLevel;
  basis_claim_ids?: string[];
}

export interface Step1ReportedNode {
  id: string;
  label: string;
  raw_name_variants: string[];
  products: string[];
  customer_type?: string;
  claim_id: string;
  evidence_level: Step1EvidenceLevel;
  children: Step1ReportedNode[];
}

export interface Step1ReportedView {
  view_type: Step1ReportedViewType;
  nodes: Step1ReportedNode[];
}

export interface Step1AnalysisOffering {
  id: string;
  canonical_name: string;
  category: string;
  raw_name_variants: string[];
  mapped_from_reported_node_ids: string[];
  products: string[];
  customer_type: string;
  claim_id: string;
  evidence_level: Step1EvidenceLevel;
}

export interface Step1AnalysisSegment {
  id: string;
  canonical_name: string;
  raw_name_variants: string[];
  mapped_from_reported_node_ids: string[];
  claim_id: string;
  evidence_level: Step1EvidenceLevel;
  offerings: Step1AnalysisOffering[];
}

export interface Step1ExcludedItem {
  raw_name: string;
  reason: string;
  evidence_level: Step1EvidenceLevel;
  claim_id: string;
}

export interface Step1AnalysisView {
  segments: Step1AnalysisSegment[];
  excluded_items: Step1ExcludedItem[];
  canonical_name_registry: Record<string, string>;
}

export interface Step1StructuredResult {
  schema_version: "v5.5";
  company_name: string;
  ticker?: string | null;
  reported_view: Step1ReportedView;
  analysis_view: Step1AnalysisView;
  claims: Step1Claim[];
  sources: Step1Source[];
}

export type Step1WorkflowStatus = "needs_review" | "can_continue";
export type Step1ValidationType = "Data" | "Information";
export type Step1SourceTier = "Tier 1" | "Tier 2" | "Not Found";
export type Step1ValidationStatus =
  | "Verified Official"
  | "Verified External Only"
  | "Partially Supported"
  | "Unverified"
  | "Incorrect";
export type Step1RecommendedAction = "Keep" | "Revise" | "Reclassify" | "Remove";

export interface Step1ReportedNodeReviewEntry {
  id: string;
  label: string;
  rawNameVariants: string[];
  products: string[];
  customerType: string | null;
  claimId: string;
  evidenceLevel: Step1EvidenceLevel;
  depth: number;
  childCount: number;
}

export interface Step1AnalysisOfferingReviewEntry {
  id: string;
  originalName: string;
  suggestedName: string;
  category: string;
  parentSegment: string;
  targetSegment: string;
  productCount: number;
  products: string[];
  rawNameVariants: string[];
  mappedReportedNodeIds: string[];
  claimId: string;
  evidenceLevel: Step1EvidenceLevel;
}

export interface Step1AnalysisSegmentReviewEntry {
  id: string;
  originalName: string;
  suggestedName: string;
  offeringCount: number;
  rawNameVariants: string[];
  mappedReportedNodeIds: string[];
  claimId: string;
  evidenceLevel: Step1EvidenceLevel;
  offerings: Step1AnalysisOfferingReviewEntry[];
}

export interface Step1ReviewSummary {
  oneLine: string;
  highlights: string[];
  warnings: string[];
}

export interface Step1ValidationMatrixRow {
  id: string;
  segment: string;
  item: string;
  validationType: Step1ValidationType;
  sourceTier: Step1SourceTier;
  sourceFound: boolean;
  sourceReference: string;
  officialSource: boolean;
  validationStatus: Step1ValidationStatus;
  recommendedAction: Step1RecommendedAction;
  claimId: string;
  evidenceLevel: Step1EvidenceLevel;
}

export interface Step1OmissionReviewEntry {
  item: string;
  reason: string;
  officialSourceReference: string;
  recommendedAction: string;
  claimId: string;
  evidenceLevel: Step1EvidenceLevel;
}

export interface Step1ReviewState {
  workflowStatus: Step1WorkflowStatus;
  approved: boolean;
  approvedAt: string | null;
  canonicalNameRegistry: Record<string, string>;
  summary: Step1ReviewSummary;
  validationMatrix: Step1ValidationMatrixRow[];
  omissionReview: Step1OmissionReviewEntry[];
  reportedView: {
    viewType: Step1ReportedViewType;
    nodes: Step1ReportedNodeReviewEntry[];
  };
  analysisView: {
    segments: Step1AnalysisSegmentReviewEntry[];
    excludedItems: Step1ExcludedItem[];
  };
}

/** Shape returned by POST /api/analyze-company */
export interface AnalyzeCompanyResponse {
  rawMarkdown: string;
  structuredResult: Step1StructuredResult | null;
  architectureJson: BusinessArchitecture | null;
  step1Review: Step1ReviewState | null;
  error?: string;
  requiresApiKey?: boolean;
}

// ---------------------------------------------------------------------------
// Step 2 – Historical Financials (Extracted & Human-Edited)
// ---------------------------------------------------------------------------

/** A single row extracted by the LLM from SEC filings. */
export interface HistoricalExtractionRow {
  id: string; // client-generated UUID for React keys & editing
  fiscalYear: number;
  quarter: string; // "Q1" | "Q2" | "Q3" | "Q4"
  segment: string;
  productCategory: string;
  productName: string;
  revenue: number | null; // USD millions; null means unavailable or not disclosed
  yoyGrowth: number; // percentage — computed client-side
  operatingIncome: number | null; // USD millions; null means unavailable or not disclosed
  notes: string;
  reviewStatus?: "Review Access Data" | "External Verification Required" | "Verified" | "Not Verified";
  internalVerify?: "Yes" | "No";
  sourceType?: "Internal" | "External" | "User Provided" | "Not Available";
  sourceName?: string;
  sourceLink?: string;
  reviewNote?: string;
}

export type Step2EvidenceLevel =
  | "DISCLOSED"
  | "STRONG_INFERENCE"
  | "WEAK_INFERENCE"
  | "UNSUPPORTED";

export type Step2ValidationStatus =
  | "verified_source"
  | "needs_review"
  | "external_verification_required"
  | "unverified";

export interface Step2Source {
  source_id: string;
  source_type: "uploaded_file" | "text_notes" | "derived" | "not_available";
  name: string;
  locator: string | null;
  excerpt: string | null;
}

export interface Step2HistoricalRow {
  row_id: string;
  fiscal_year: number;
  quarter: "Q1" | "Q2" | "Q3" | "Q4";
  segment: string;
  product_category: string;
  product_name: string;
  revenue_usd_m: number | null;
  operating_income_usd_m: number | null;
  mapped_from_step1_ids: string[];
  source_id: string;
  evidence_level: Step2EvidenceLevel;
  validation_status: Step2ValidationStatus;
  review_note: string;
}

export interface Step2ExcludedItem {
  label: string;
  reason: string;
  source_id: string | null;
  evidence_level: Step2EvidenceLevel;
}

export interface Step2ValidationWarning {
  code: string;
  severity: "info" | "warn" | "high";
  message: string;
  row_ids: string[];
}

export interface Step2StructuredResult {
  schema_version: "v5.5";
  company_name: string;
  target_year: number;
  rows: Step2HistoricalRow[];
  sources: Step2Source[];
  excluded_items: Step2ExcludedItem[];
  validation_warnings: Step2ValidationWarning[];
  review_summary: {
    one_line: string;
    highlights: string[];
    warnings: string[];
  };
}

/** Shape returned by POST /api/extract-history */
export interface ExtractHistoryResponse {
  rows: Omit<HistoricalExtractionRow, "id" | "yoyGrowth">[];
  structuredResult?: Step2StructuredResult | null;
  error?: string;
  requiresApiKey?: boolean;
}

/** The master history kept in global context (confirmed rows across years). */
export interface HistoricalData {
  rows: HistoricalExtractionRow[];
  confirmedYears: number[]; // distinct years already appended (max 5)
  structuredResults?: Step2StructuredResult[]; // approved Step 2 v5.5 artifacts
}

// Kept for backward-compat — used by the export API
export interface QuarterlyFinancials {
  quarter: FiscalQuarter;
  revenue: number;
  costOfRevenue: number;
  grossProfit: number;
  operatingExpenses: number;
  operatingIncome: number;
  netIncome: number;
  depreciation: number;
  capex: number;
  freeCashFlow: number;
  sharesOutstanding: number;
}

export interface AnnualSummary {
  year: number;
  revenue: number;
  freeCashFlow: number;
  fcfMargin: number; // percentage
}

// ---------------------------------------------------------------------------
// Step 3 – Competitive Landscape (Porter's Five Forces per Category)
// ---------------------------------------------------------------------------

export type ForceRating = "Low" | "Medium" | "High";

export interface ForceDetail {
  rating: ForceRating;
  justification: string;
}

export interface PorterForces {
  rivalry: ForceDetail;
  newEntrants: ForceDetail;
  suppliers: ForceDetail;
  buyers: ForceDetail;
  substitutes: ForceDetail;
}

export interface CategoryCompetitionEntry {
  category: string;
  primaryCompetitor: string;
  competitiveStatus: string;
  basisForPairing: string;
  forces: PorterForces;
  verificationNote?: string;
  sourceQuality?: "Official" | "External" | "Mixed" | "Unverified";
  confidence?: "High" | "Medium" | "Low";
}

export type Step3EvidenceLevel =
  | "DISCLOSED"
  | "STRONG_INFERENCE"
  | "WEAK_INFERENCE"
  | "UNSUPPORTED";

export type Step3SourceQuality = "Official" | "External" | "Mixed" | "Unverified";

export interface Step3Source {
  source_id: string;
  source_type:
    | "official_filing"
    | "competitor_filing"
    | "company_release"
    | "market_research"
    | "news"
    | "not_available";
  name: string;
  url: string | null;
  locator: string | null;
  excerpt: string | null;
}

export interface Step3Claim {
  claim_id: string;
  text: string;
  source_ids: string[];
  evidence_level: Step3EvidenceLevel;
  source_snippet: string | null;
}

export interface Step3ForceDetail {
  rating: ForceRating;
  justification: string;
  claim_id: string;
  source_ids: string[];
}

export interface Step3StructuredCategory {
  category_id: string;
  category: string;
  mapped_from_step1_ids: string[];
  materiality: "HIGH" | "MEDIUM" | "LOW";
  primary_competitor: string;
  competitive_status: "Leader" | "Challenger" | "Unclear";
  basis_for_pairing: string;
  basis_claim_ids: string[];
  source_ids: string[];
  source_quality: Step3SourceQuality;
  confidence: "High" | "Medium" | "Low";
  human_review_required: boolean;
  verification_note: string | null;
  forces: {
    rivalry: Step3ForceDetail;
    new_entrants: Step3ForceDetail;
    suppliers: Step3ForceDetail;
    buyers: Step3ForceDetail;
    substitutes: Step3ForceDetail;
  };
}

export interface Step3ValidationWarning {
  code: string;
  severity: "info" | "warn" | "high";
  message: string;
  category_ids: string[];
}

export interface Step3StructuredResult {
  schema_version: "v5.5";
  company_name: string;
  review_summary: {
    one_line: string;
    highlights: string[];
    warnings: string[];
  };
  sources: Step3Source[];
  categories: Step3StructuredCategory[];
  claims: Step3Claim[];
  validation_warnings: Step3ValidationWarning[];
}

export interface Step3ReviewCategory {
  id: string;
  category: string;
  mappedFromStep1Ids: string[];
  materiality: "HIGH" | "MEDIUM" | "LOW";
  humanReviewRequired: boolean;
  sourceQuality: Step3SourceQuality;
  confidence: "High" | "Medium" | "Low";
  verificationNote: string | null;
  basisClaimIds: string[];
  sourceIds: string[];
  sources: Step3Source[];
  editable: {
    primaryCompetitor: string;
    competitiveStatus: "Leader" | "Challenger" | "Unclear";
    basisForPairing: string;
  };
  forces: Step3StructuredCategory["forces"];
}

export interface Step3ReviewState {
  workflowStatus: Step1WorkflowStatus;
  approved: boolean;
  approvedAt: string | null;
  summary: Step1ReviewSummary;
  categories: Step3ReviewCategory[];
  validationWarnings: Array<{
    code: string;
    severity: "info" | "warn" | "high";
    message: string;
    categoryIds: string[];
  }>;
}

/** Shape returned by POST /api/analyze-competition */
export interface AnalyzeCompetitionResponse {
  categories: CategoryCompetitionEntry[];
  structuredResult?: Step3StructuredResult | null;
  step3Review?: Step3ReviewState | null;
  error?: string;
  requiresApiKey?: boolean;
}

/** Shape returned by POST /api/revise-competition */
export interface ReviseCompetitionResponse {
  category: CategoryCompetitionEntry;
  structuredCategory?: Step3StructuredCategory | null;
  error?: string;
  requiresApiKey?: boolean;
}

/** Global state for Step 3 */
export interface CompetitiveLandscape {
  categories: CategoryCompetitionEntry[];
  structuredResult: Step3StructuredResult | null;
  step3Review: Step3ReviewState | null;
  approved: boolean;
}

// ---------------------------------------------------------------------------
// Step 4 – Cross-Business Capability Penetration & Synergies
// ---------------------------------------------------------------------------

export type FinancialSignalType =
  | "Revenue Enablement"
  | "Margin Expansion"
  | "CAC Reduction"
  | "Cost Displacement"
  | "product-only";

export interface FinancialSignal {
  type: FinancialSignalType;
  evidence: string;
  status: "financially-material" | "product-only";
}

export interface FlywheelInfo {
  isFlywheel: boolean;
  loopDescription: string;
}

export interface CapabilityPenetrationPath {
  sourceBusiness: string;
  coreCapability: string;
  recipientBusiness: string;
  mechanism: string;
  productImpact: string;
  competitorConstraint: string;
  financialSignal: FinancialSignal;
  flywheel: FlywheelInfo;
  impactScore: number; // -5 to +5
  synergyClassification?: "Material Synergy" | "Adjacent Revenue" | "Disputed";
  reviewRationale?: string;
}

/** Shape returned by POST /api/analyze-synergies */
export interface AnalyzeSynergiesResponse {
  paths: CapabilityPenetrationPath[];
  structuredResult?: Step4StructuredResult | null;
  step4Review?: Step4ReviewState | null;
  capital?: CapitalAllocationData | null;
  error?: string;
  requiresApiKey?: boolean;
}

/** Shape returned by POST /api/revise-synergies */
export interface ReviseSynergiesResponse {
  path: CapabilityPenetrationPath;
  error?: string;
  requiresApiKey?: boolean;
}

// ---------------------------------------------------------------------------
// Step 4B – Capital Allocation (sub-step inside Step 4)
// ---------------------------------------------------------------------------

export interface InvestmentMatrixEntry {
  pillar: string;
  objective: string;
  capitalIntensity: string;
  strategicLeverage: string;
  synergyLink: string;
  efficiencyScore: number; // -5 to +5
}

export interface CapitalCheckpoints {
  capexRunway: string;
  subsidiaryMargin: string;
  investmentEfficiency: string;
}

export interface CapitalAllocationData {
  investmentMatrix: InvestmentMatrixEntry[];
  checkpoints: CapitalCheckpoints;
}

export interface Step4Source {
  source_id: string;
  source_type:
    | "official_filing"
    | "company_release"
    | "earnings_transcript"
    | "market_research"
    | "news"
    | "uploaded_file"
    | "text_notes"
    | "derived"
    | "not_available";
  name: string;
  url: string | null;
  locator: string | null;
  excerpt: string | null;
}

export interface Step4ReviewSynergy {
  id: string;
  sourceBusiness: string;
  recipientBusiness: string;
  integrationVerdict: "PROVEN" | "PARTIAL" | "NOT_PROVEN";
  differentiationVerdict: "PROVEN" | "PARTIAL" | "NOT_PROVEN" | "SKIPPED_LIGHT_MODE";
  causalityVerdict: "PROVEN" | "PARTIAL" | "NOT_PROVEN";
  classification: "fully_verified_synergy" | "integration_only" | "context_only" | "unsupported";
  driverEligibility: "FULL" | "CAPPED_3PP" | "CAPPED_2PP" | "CONTEXT_ONLY" | "NOT_ALLOWED";
  humanReviewRequired: boolean;
  basisClaimIds: string[];
  sourceIds: string[];
  sources: Step4Source[];
  editable: {
    mechanism: string;
    productImpact: string;
    competitorConstraint: string;
    financialMetricLink: string;
    reviewRationale: string;
  };
}

export interface Step4ReviewCapitalMetric {
  id: string;
  pillar: string;
  capitalIntensity: "Low" | "Medium" | "High" | "Unknown";
  synergyLink: string;
  claimId: string;
  sourceIds: string[];
  sources: Step4Source[];
  reviewNote: string;
  editable: {
    objective: string;
    strategicLeverage: string;
  };
}

export interface Step4ReviewState {
  workflowStatus: "needs_review" | "can_continue";
  approved: boolean;
  approvedAt: string | null;
  summary: Step1ReviewSummary;
  synergies: Step4ReviewSynergy[];
  capitalMetrics: Step4ReviewCapitalMetric[];
  capitalAllocation: {
    assetLightExemption: boolean;
    workflowStatus: "READY" | "NEEDS_REVIEW" | "BLOCKED";
    nextAction: "PROCEED_STEP5" | "HUMAN_REVIEW_CAPITAL_CONSTRAINT" | "REGENERATE";
    step5RevenueCeiling: {
      applies: boolean;
      reason: string;
      ceiling_revenue_usd_m: number | null;
    };
  };
  validationWarnings: Array<{
    code: string;
    severity: "info" | "warn" | "high";
    message: string;
    synergyIds: string[];
    capitalMetricIds: string[];
  }>;
}

export interface Step4StructuredResult {
  schema_version: "v5.5";
  company_name: string;
  review_summary: {
    one_line: string;
    highlights: string[];
    warnings: string[];
  };
  sources: Step4Source[];
  claims: Array<{
    claim_id: string;
    text: string;
    source_ids: string[];
    evidence_level: "DISCLOSED" | "STRONG_INFERENCE" | "WEAK_INFERENCE" | "UNSUPPORTED";
    source_snippet: string | null;
  }>;
  synergy_registry: Array<{
    synergy_id: string;
    source_business: string;
    core_capability: string;
    recipient_business: string;
    mechanism: string;
    product_impact: string;
    competitor_constraint: string;
    financial_signal: {
      type: FinancialSignalType;
      evidence: string;
      status: "financially-material" | "product-only";
      claim_id: string;
      source_ids: string[];
    };
    flywheel: {
      is_flywheel: boolean;
      loop_description: string;
    };
    integration_verdict: "PROVEN" | "PARTIAL" | "NOT_PROVEN";
    differentiation_verdict: "PROVEN" | "PARTIAL" | "NOT_PROVEN" | "SKIPPED_LIGHT_MODE";
    causality_verdict: "PROVEN" | "PARTIAL" | "NOT_PROVEN";
    classification: "fully_verified_synergy" | "integration_only" | "context_only" | "unsupported";
    driver_eligibility: "FULL" | "CAPPED_3PP" | "CAPPED_2PP" | "CONTEXT_ONLY" | "NOT_ALLOWED";
    basis_claim_ids: string[];
    financial_metric_link: string;
    impact_score: number;
    human_review_required: boolean;
    review_rationale: string;
  }>;
  capital_allocation: {
    capital_metrics: Array<{
      metric_id: string;
      pillar: string;
      objective: string;
      capital_intensity: "Low" | "Medium" | "High" | "Unknown";
      strategic_leverage: string;
      synergy_link: string;
      efficiency_score: number;
      claim_id: string;
      source_ids: string[];
      review_note: string;
    }>;
    feasibility_checkpoints: {
      capex_runway: string;
      scale_economics: string;
      guidance_alignment: string;
    };
    step5_revenue_ceiling: {
      applies: boolean;
      reason: string;
      ceiling_revenue_usd_m: number | null;
    };
    asset_light_exemption: boolean;
    workflow_status: "READY" | "NEEDS_REVIEW" | "BLOCKED";
    next_action: "PROCEED_STEP5" | "HUMAN_REVIEW_CAPITAL_CONSTRAINT" | "REGENERATE";
  };
  validation_warnings: Array<{
    code: string;
    severity: "info" | "warn" | "high";
    message: string;
    synergy_ids: string[];
    capital_metric_ids: string[];
  }>;
}

/** Shape returned by POST /api/analyze-capital */
export interface AnalyzeCapitalResponse {
  data: CapitalAllocationData;
  paths?: CapabilityPenetrationPath[];
  structuredResult?: Step4StructuredResult | null;
  step4Review?: Step4ReviewState | null;
  error?: string;
  requiresApiKey?: boolean;
}

/** Shape returned by POST /api/revise-capital */
export interface ReviseCapitalResponse {
  entry: InvestmentMatrixEntry;
  error?: string;
  requiresApiKey?: boolean;
}

/** Global state for Step 4 (combined synergies + capital) */
export interface SynergiesAndDrivers {
  paths: CapabilityPenetrationPath[];
  synergiesApproved: boolean;
  capital: CapitalAllocationData | null;
  capitalApproved: boolean;
  recentNews: string;
  structuredResult: Step4StructuredResult | null;
  step4Review: Step4ReviewState | null;
}

// ---------------------------------------------------------------------------
// Step 5 – v5.5 Forecasting Artifact + legacy 20-quarter UI projection
// ---------------------------------------------------------------------------

export type Step5ForecastMode = "SEGMENT_ANNUAL" | "SEGMENT_QUARTERLY" | "PRODUCT_QUARTERLY";
export type Step5DriverQuality = "DISCLOSED" | "STRONG" | "WEAK" | "ESTIMATED_BASE";
export type Step5WorkflowStatus = "READY" | "NEEDS_REVIEW" | "BLOCKED";
export type Step5NextAction = "PROCEED_STEP7" | "HUMAN_REVIEW_MAJOR_ASSUMPTION" | "REGENERATE";

export interface Step5ReviewSummary {
  one_line: string;
  highlights: string[];
  warnings: string[];
}

export interface Step5Assumption {
  id: string;
  statement: string;
  basis_claim_ids: string[];
  driver_quality: Step5DriverQuality;
  driver_eligibility_source: string;
  arithmetic_trace: string;
  management_override_required: boolean;
}

export interface Step5ForecastRow {
  segment: string;
  category: string;
  product: string | null;
  fiscal_year: string;
  quarter: string | null;
  revenue_low_usd_m: number;
  revenue_base_usd_m: number;
  revenue_high_usd_m: number;
  yoy_growth_pct: number;
  assumption_ids: string[];
  driver_quality: Step5DriverQuality;
  flags: string[];
}

export interface Step5MachineArtifact {
  forecast_mode: Step5ForecastMode;
  assumptions: Step5Assumption[];
  forecast_table: Step5ForecastRow[];
  weak_inference_sensitivity: {
    assumption_id: string;
    evidence_level: "WEAK_INFERENCE" | "WEAK" | "ESTIMATED_BASE";
    if_removed_revenue_impact_usd_m: number;
    fy5_impact_pct: number;
    flag: string;
  }[];
  confidence_summary: {
    total_fy5_revenue_base_usd_m: number | null;
    disclosed_driver_revenue_pct: number;
    strong_driver_revenue_pct: number;
    weak_driver_revenue_pct: number;
    high_uncertainty_flags: number;
  };
  workflow_status: Step5WorkflowStatus;
  next_action: Step5NextAction;
}

export interface Step5StructuredResult {
  schema_version: "v5.5";
  company_name: string;
  review_summary: Step5ReviewSummary;
  machine_artifact: Step5MachineArtifact;
}

export interface ForecastQuarterPoint {
  year: number; // 1–5
  quarter: string; // "Q1"–"Q4"
  revenueM: number; // USD millions
  yoyGrowth: number; // percentage
  strategicDriver: string;
}

export interface ProductForecast {
  productName: string;
  categoryName: string;
  forecast: ForecastQuarterPoint[]; // exactly 20
}

export interface SegmentForecastBundle {
  segment: string;
  products: ProductForecast[];
  structuredResult?: Step5StructuredResult;
}

/** Shape returned by POST /api/generate-forecast */
export interface GenerateForecastResponse {
  products: ProductForecast[];
  structuredResult?: Step5StructuredResult;
  reviewSummary?: Step5ReviewSummary;
  workflowStatus?: Step5WorkflowStatus;
  nextAction?: Step5NextAction;
  error?: string;
  requiresApiKey?: boolean;
}

/** Global state for Step 5 */
export interface ForecastState {
  segments: SegmentForecastBundle[];
  structuredResults?: Step5StructuredResult[];
  approved: boolean;
}

// Legacy — kept for Step 5 old placeholder compatibility
export interface CapitalAndMoats {
  debtToEquity: number | null;
  interestCoverageRatio: number | null;
  moatType: ("brand" | "network" | "cost" | "switching" | "intangible" | "none")[];
  moatDurability: "narrow" | "wide" | "none" | null;
  capitalAllocationSummary: string;
}

// ---------------------------------------------------------------------------
// Step 6 – Executive Summary & Consolidated Forecast
// ---------------------------------------------------------------------------

/** One row in the master aggregation table */
export interface AggregatedRow {
  segment: string;
  category: string;
  fy1: number;
  fy2: number;
  fy3: number;
  fy4: number;
  fy5: number;
  cagr: number; // percentage, ((FY5/FY1)^(1/4) - 1) * 100
  isSubtotal?: boolean;
  isTotal?: boolean;
}

/** Returned by the AI summary API */
export interface TopEngine {
  name: string;
  cagr: string;
  explanation: string;
}

export interface SummaryConclusion {
  revenueShift: string;
  ecosystemResilience: string;
}

export interface SummaryInsights {
  topEngines: TopEngine[];
  conclusion: SummaryConclusion;
}

/** Shape returned by POST /api/generate-summary */
export interface GenerateSummaryResponse {
  insights: SummaryInsights;
  error?: string;
  requiresApiKey?: boolean;
}

/** Global state for Step 6 */
export interface SummaryState {
  aggregatedRows: AggregatedRow[];
  insights: SummaryInsights | null;
}

// Legacy types kept for backward compatibility
export interface ProjectedQuarter {
  quarter: FiscalQuarter;
  projectedRevenue: number;
  projectedFCF: number;
  revenueGrowthYoY: number;
  fcfMargin: number;
  confidenceLevel: "low" | "medium" | "high";
}

export interface FiveYearOutlook {
  projectedQuarters: ProjectedQuarter[];
  annualFCFCurve: AnnualFCFPoint[];
  assumptions: string[];
  modelVersion: string;
}

export interface AnnualFCFPoint {
  year: number;
  projectedFCF: number;
  yoyGrowthRate: number;
}

// ---------------------------------------------------------------------------
// Aggregated CFP State
// ---------------------------------------------------------------------------
import type { WACCState } from "./wacc";

export interface CFPState {
  currentStep: number; // 1–8
  isLoading: boolean;
  error: string | null;

  // Module 1: Cash Flow Projector (Steps 1–6)
  profile: CompanyProfile;
  history: HistoricalData;
  competition: CompetitiveLandscape;
  synergies: SynergiesAndDrivers;
  forecast: ForecastState;
  summary: SummaryState;
  capitalAndMoats: CapitalAndMoats;
  outlook: FiveYearOutlook;

  // Module 2: Discount Rate and Valuation (Steps 7-8)
  wacc: WACCState;
}

// ---------------------------------------------------------------------------
// Context Action Types
// ---------------------------------------------------------------------------
export type CFPAction =
  | { type: "SET_STEP"; payload: number }
  | { type: "NEXT_STEP" }
  | { type: "PREV_STEP" }
  | { type: "SET_LOADING"; payload: boolean }
  | { type: "SET_ERROR"; payload: string | null }
  | { type: "UPDATE_PROFILE"; payload: Partial<CompanyProfile> }
  | {
      type: "SET_PROFILE_ANALYSIS";
      payload: {
        rawMarkdown: string;
        structuredResult: Step1StructuredResult | null;
        architectureJson: BusinessArchitecture | null;
        step1Review: Step1ReviewState | null;
      };
    }
  | { type: "SET_HISTORY"; payload: HistoricalData }
  | { type: "APPEND_HISTORY_ROWS"; payload: { year: number; rows: HistoricalExtractionRow[] } }
  | { type: "CLEAR_HISTORY" }
  | { type: "SET_COMPETITION"; payload: CompetitiveLandscape }
  | { type: "CLEAR_COMPETITION" }
  | { type: "SET_SYNERGIES"; payload: SynergiesAndDrivers }
  | {
      type: "SET_SYNERGIES_PATHS";
      payload: {
        paths: CapabilityPenetrationPath[];
        structuredResult?: Step4StructuredResult | null;
        step4Review?: Step4ReviewState | null;
      };
    }
  | {
      type: "SET_CAPITAL_DATA";
      payload: {
        capital: CapitalAllocationData;
        recentNews: string;
        structuredResult?: Step4StructuredResult | null;
        step4Review?: Step4ReviewState | null;
      };
    }
  | { type: "CLEAR_SYNERGIES" }
  | { type: "SET_FORECAST"; payload: ForecastState }
  | { type: "CLEAR_FORECAST" }
  | { type: "SET_SUMMARY"; payload: SummaryState }
  | { type: "SET_CAPITAL_MOATS"; payload: CapitalAndMoats }
  | { type: "SET_OUTLOOK"; payload: FiveYearOutlook }
  | { type: "SET_WACC"; payload: WACCState }
  | { type: "CLEAR_WACC" }
  | { type: "RESET" };

// ---------------------------------------------------------------------------
// API Export Contract (consumed by the Core DCF Tool)
// ---------------------------------------------------------------------------
export interface CFPExportPayload {
  ticker: string;
  companyName: string;
  currency: string;
  generatedAt: string; // ISO timestamp
  annualFCFCurve: AnnualFCFPoint[];
  projectedQuarters: ProjectedQuarter[];
  modelVersion: string;
}
