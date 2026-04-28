"use client";

import {
  createContext,
  useContext,
  useReducer,
  type ReactNode,
  type Dispatch,
} from "react";
import type { CFPState, CFPAction } from "@/types/cfp";

// =============================================================================
// Initial (empty) state — filled step-by-step as the user progresses
// =============================================================================
const TOTAL_STEPS = 8;

export const initialCFPState: CFPState = {
  currentStep: 1,
  isLoading: false,
  error: null,

  profile: {
    ticker: "",
    companyName: "",
    sector: "",
    industry: "",
    marketCap: null,
    currency: "USD",
    fiscalYearEnd: "",
    lastUpdated: null,
    rawAnalysisMarkdown: "",
    step1StructuredResult: null,
    architectureJson: null,
    step1Review: null,
  },

  history: {
    rows: [],
    confirmedYears: [],
    structuredResults: [],
  },

  competition: {
    categories: [],
    structuredResult: null,
    step3Review: null,
    approved: false,
  },

  synergies: {
    paths: [],
    synergiesApproved: false,
    capital: null,
    capitalApproved: false,
    recentNews: "",
    structuredResult: null,
    step4Review: null,
  },

  forecast: {
    segments: [],
    structuredResults: [],
    approved: false,
  },

  summary: {
    aggregatedRows: [],
    insights: null,
  },

  capitalAndMoats: {
    debtToEquity: null,
    interestCoverageRatio: null,
    moatType: [],
    moatDurability: null,
    capitalAllocationSummary: "",
  },

  outlook: {
    projectedQuarters: [],
    annualFCFCurve: [],
    assumptions: [],
    modelVersion: "0.1.0-alpha",
  },

  wacc: {
    fetchedData: null,
    constants: { riskFreeRate: 0.0428, impliedERP: 0.0451, marginalTaxRate: 0.21 },
    businessType: "single",
    singleBeta: 1.0,
    segments: [],
    calculation: null,
    saved: false,
  },
};

// =============================================================================
// Reducer
// =============================================================================
function cfpReducer(state: CFPState, action: CFPAction): CFPState {
  switch (action.type) {
    case "SET_STEP":
      return { ...state, currentStep: Math.min(Math.max(action.payload, 1), TOTAL_STEPS) };

    case "NEXT_STEP":
      return { ...state, currentStep: Math.min(state.currentStep + 1, TOTAL_STEPS) };

    case "PREV_STEP":
      return { ...state, currentStep: Math.max(state.currentStep - 1, 1) };

    case "SET_LOADING":
      return { ...state, isLoading: action.payload };

    case "SET_ERROR":
      return { ...state, error: action.payload };

    case "UPDATE_PROFILE":
      return { ...state, profile: { ...state.profile, ...action.payload } };

    case "SET_PROFILE_ANALYSIS":
      return {
        ...state,
        profile: {
          ...state.profile,
          ticker: action.payload.structuredResult?.ticker ?? state.profile.ticker,
          companyName: action.payload.structuredResult?.company_name ?? state.profile.companyName,
          rawAnalysisMarkdown: action.payload.rawMarkdown,
          step1StructuredResult: action.payload.structuredResult,
          architectureJson: action.payload.architectureJson,
          step1Review: action.payload.step1Review,
          lastUpdated: new Date().toISOString(),
        },
      };

    case "SET_HISTORY":
      return { ...state, history: action.payload };

    case "APPEND_HISTORY_ROWS": {
      const { year, rows } = action.payload;
      const existingYears = state.history.confirmedYears;
      // Don't duplicate a year that's already confirmed
      const newYears = existingYears.includes(year)
        ? existingYears
        : [...existingYears, year].sort((a, b) => a - b);
      return {
        ...state,
        history: {
          rows: [...state.history.rows, ...rows],
          confirmedYears: newYears,
        },
      };
    }

    case "CLEAR_HISTORY":
      return {
        ...state,
        history: { rows: [], confirmedYears: [], structuredResults: [] },
      };

    case "SET_COMPETITION":
      return { ...state, competition: action.payload };

    case "CLEAR_COMPETITION":
      return {
        ...state,
        competition: { categories: [], structuredResult: null, step3Review: null, approved: false },
      };

    case "SET_SYNERGIES":
      return { ...state, synergies: action.payload };

    case "SET_SYNERGIES_PATHS":
      return {
        ...state,
        synergies: {
          ...state.synergies,
          paths: action.payload.paths,
          synergiesApproved: true,
          structuredResult: action.payload.structuredResult ?? state.synergies.structuredResult,
          step4Review: action.payload.step4Review ?? state.synergies.step4Review,
        },
      };

    case "SET_CAPITAL_DATA":
      return {
        ...state,
        synergies: {
          ...state.synergies,
          capital: action.payload.capital,
          capitalApproved: true,
          recentNews: action.payload.recentNews,
          structuredResult: action.payload.structuredResult ?? state.synergies.structuredResult,
          step4Review: action.payload.step4Review ?? state.synergies.step4Review,
        },
      };

    case "CLEAR_SYNERGIES":
      return {
        ...state,
        synergies: {
          paths: [],
          synergiesApproved: false,
          capital: null,
          capitalApproved: false,
          recentNews: "",
          structuredResult: null,
          step4Review: null,
        },
      };

    case "SET_FORECAST":
      return { ...state, forecast: action.payload };

    case "CLEAR_FORECAST":
      return { ...state, forecast: { segments: [], structuredResults: [], approved: false } };

    case "SET_SUMMARY":
      return { ...state, summary: action.payload };

    case "SET_CAPITAL_MOATS":
      return { ...state, capitalAndMoats: action.payload };

    case "SET_OUTLOOK":
      return { ...state, outlook: action.payload };

    case "SET_WACC":
      return { ...state, wacc: action.payload };

    case "CLEAR_WACC":
      return { ...state, wacc: initialCFPState.wacc };

    case "RESET":
      return initialCFPState;

    default:
      return state;
  }
}

// =============================================================================
// Context + Provider
// =============================================================================
interface CFPContextValue {
  state: CFPState;
  dispatch: Dispatch<CFPAction>;
  totalSteps: number;
}

const CFPContext = createContext<CFPContextValue | undefined>(undefined);

export function CFPProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(cfpReducer, initialCFPState);

  return (
    <CFPContext.Provider value={{ state, dispatch, totalSteps: TOTAL_STEPS }}>
      {children}
    </CFPContext.Provider>
  );
}

/** Type-safe hook — throws if used outside <CFPProvider>. */
export function useCFP(): CFPContextValue {
  const ctx = useContext(CFPContext);
  if (!ctx) {
    throw new Error("useCFP must be used within a <CFPProvider>");
  }
  return ctx;
}
