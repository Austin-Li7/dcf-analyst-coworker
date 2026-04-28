"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import type { SettingsState } from "@/types/cfp";

// =============================================================================
// Defaults & localStorage key
// =============================================================================
const STORAGE_KEY = "dcf-cfp-settings";

const defaultSettings: SettingsState = {
  llmProvider: "claude",
  claudeApiKey: "",
  geminiApiKey: "",
};

function loadInitialSettings(): SettingsState {
  if (typeof window === "undefined") return defaultSettings;

  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return defaultSettings;
    return { ...defaultSettings, ...JSON.parse(stored) };
  } catch {
    return defaultSettings;
  }
}

// =============================================================================
// Context value
// =============================================================================
interface SettingsContextValue {
  settings: SettingsState;
  updateSettings: (partial: Partial<SettingsState>) => void;
  /** The API key for the currently selected provider. */
  activeApiKey: string;
}

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

// =============================================================================
// Provider
// =============================================================================
export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<SettingsState>(loadInitialSettings);

  // Persist to localStorage on every change.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch {
      // localStorage full or unavailable
    }
  }, [settings]);

  const updateSettings = useCallback((partial: Partial<SettingsState>) => {
    setSettings((prev) => ({ ...prev, ...partial }));
  }, []);

  const activeApiKey =
    settings.llmProvider === "claude"
      ? settings.claudeApiKey
      : settings.geminiApiKey;

  return (
    <SettingsContext.Provider value={{ settings, updateSettings, activeApiKey }}>
      {children}
    </SettingsContext.Provider>
  );
}

// =============================================================================
// Hook
// =============================================================================
export function useSettings(): SettingsContextValue {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useSettings must be used within a <SettingsProvider>");
  }
  return ctx;
}
