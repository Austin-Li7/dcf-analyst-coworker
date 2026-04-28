"use client";

import { X, Settings, Cpu, KeyRound, Check, AlertCircle } from "lucide-react";
import { useSettings } from "@/context/SettingsContext";
import type { LLMProvider } from "@/types/cfp";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export default function SettingsModal({ open, onClose }: SettingsModalProps) {
  const { settings, updateSettings } = useSettings();

  if (!open) return null;

  const hasClaudeKey = settings.claudeApiKey.trim().length > 0;
  const hasGeminiKey = settings.geminiApiKey.trim().length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
      <div className="relative mx-4 w-full max-w-lg rounded-2xl border border-zinc-700 bg-zinc-900 p-6 shadow-2xl">
        {/* Close */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
        >
          <X size={18} />
        </button>

        {/* Header */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-600/20">
            <Settings size={20} className="text-blue-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-zinc-100">Settings</h3>
            <p className="text-xs text-zinc-500">Configure your AI engine and API keys</p>
          </div>
        </div>

        <div className="space-y-5">
          {/* Provider selector */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-zinc-300">
              <Cpu size={14} /> Active AI Engine
            </label>
            <select
              value={settings.llmProvider}
              onChange={(e) => updateSettings({ llmProvider: e.target.value as LLMProvider })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            >
              <option value="claude">Claude Sonnet 4 (Anthropic)</option>
              <option value="gemini">Gemini 2.5 Pro (Google)</option>
            </select>
          </div>

          {/* Anthropic key */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-zinc-300">
              <KeyRound size={14} />
              Anthropic API Key
              <span className={`ml-auto flex items-center gap-1 text-xs ${hasClaudeKey ? "text-emerald-400" : "text-zinc-600"}`}>
                {hasClaudeKey ? <><Check size={10} /> Configured</> : <><AlertCircle size={10} /> Not set</>}
              </span>
            </label>
            <input
              type="password"
              autoComplete="off"
              placeholder="sk-ant-..."
              value={settings.claudeApiKey}
              onChange={(e) => updateSettings({ claudeApiKey: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Gemini key */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-zinc-300">
              <KeyRound size={14} />
              Google Gemini API Key
              <span className={`ml-auto flex items-center gap-1 text-xs ${hasGeminiKey ? "text-emerald-400" : "text-zinc-600"}`}>
                {hasGeminiKey ? <><Check size={10} /> Configured</> : <><AlertCircle size={10} /> Not set</>}
              </span>
            </label>
            <input
              type="password"
              autoComplete="off"
              placeholder="AI..."
              value={settings.geminiApiKey}
              onChange={(e) => updateSettings({ geminiApiKey: e.target.value })}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-2.5 text-sm text-zinc-100 placeholder-zinc-600 outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
            />
          </div>

          {/* Helper text */}
          <p className="rounded-lg border border-zinc-800 bg-zinc-950 p-3 text-xs text-zinc-500">
            Keys are stored securely in your browser&apos;s local storage and are never saved to a database.
            Server-side <code className="rounded bg-zinc-800 px-1">.env</code> keys are used as a fallback
            if no browser key is set.
          </p>

          {/* Save & Close */}
          <button
            onClick={onClose}
            className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500"
          >
            Save &amp; Close
          </button>
        </div>
      </div>
    </div>
  );
}
