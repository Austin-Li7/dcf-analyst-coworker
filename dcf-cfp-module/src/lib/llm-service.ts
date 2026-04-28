/**
 * Centralized server-side LLM abstraction.
 * Dispatches to Anthropic (Claude) or Google (Gemini) based on the provider.
 * Imported only by API route handlers — never by client components.
 */

import Anthropic from "@anthropic-ai/sdk";
import { GoogleGenerativeAI } from "@google/generative-ai";
import type { LLMProvider } from "@/types/cfp";

type JsonSchemaObject = Record<string, unknown>;

// =============================================================================
// Public interface
// =============================================================================

export interface CallLLMOptions {
  provider: LLMProvider;
  apiKey: string;
  prompt: string;
  systemPrompt?: string;
  maxTokens?: number;
  /**
   * Optional Gemini-native responseSchema (JSON Schema object).
   * When provided the Gemini branch enables responseMimeType "application/json"
   * and passes the schema, guaranteeing structured output.
   * When provided for Claude, the request is forced through a tool schema.
   */
  responseSchema?: JsonSchemaObject;
  responseToolName?: string;
  responseToolDescription?: string;
}

export interface CallLLMResult {
  text: string;
  structuredData?: unknown;
  finishReason?: string;
  finishMessage?: string;
}

export function parseStructuredJsonText(
  text: string,
  context: { provider: LLMProvider; finishReason?: string; finishMessage?: string },
): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    if (
      context.provider === "gemini" &&
      context.finishReason === "MAX_TOKENS" &&
      error instanceof SyntaxError
    ) {
      throw new Error(
        `Structured output was truncated because Gemini hit MAX_TOKENS. ${context.finishMessage ?? "Try retrying with a smaller output or a higher token limit."}`.trim(),
      );
    }

    throw error;
  }
}

// =============================================================================
// Key resolution helper (used by every API route)
// =============================================================================

/**
 * Resolve the API key for a given provider.
 * Priority: runtime key from request > environment variable.
 */
export function resolveApiKey(
  provider: LLMProvider,
  runtimeKey?: string,
): { apiKey: string; needsKey: boolean } {
  const key =
    (typeof runtimeKey === "string" && runtimeKey.trim()) ||
    (provider === "claude"
      ? process.env.ANTHROPIC_API_KEY
      : process.env.GEMINI_API_KEY) ||
    "";
  return { apiKey: key, needsKey: !key };
}

// =============================================================================
// Main dispatch
// =============================================================================

export async function callLLM(options: CallLLMOptions): Promise<CallLLMResult> {
  const { provider, apiKey, prompt, systemPrompt, maxTokens = 8192 } = options;

  if (!apiKey) {
    throw new Error("No API key provided for the selected LLM provider.");
  }

  if (provider === "gemini") {
    return callGemini(apiKey, prompt, systemPrompt, maxTokens, options.responseSchema);
  }

  // Default: Claude
  return callClaude(
    apiKey,
    prompt,
    systemPrompt,
    maxTokens,
    options.responseSchema,
    options.responseToolName,
    options.responseToolDescription,
  );
}

// =============================================================================
// Claude (Anthropic)
// =============================================================================

async function callClaude(
  apiKey: string,
  prompt: string,
  systemPrompt: string | undefined,
  maxTokens: number,
  responseSchema?: JsonSchemaObject,
  responseToolName = "submit_step1_structured_result",
  responseToolDescription = "Return the validated Step 1 structured payload.",
): Promise<CallLLMResult> {
  const anthropic = new Anthropic({ apiKey });

  const request: Anthropic.MessageCreateParamsNonStreaming = {
    model: "claude-sonnet-4-20250514",
    max_tokens: maxTokens,
    ...(systemPrompt ? { system: systemPrompt } : {}),
    ...(responseSchema
      ? {
          tools: [
            {
              name: responseToolName,
              description: responseToolDescription,
              input_schema: responseSchema as Anthropic.Tool.InputSchema,
            },
          ],
          tool_choice: {
            type: "tool",
            name: responseToolName,
          },
        }
      : {}),
    messages: [{ role: "user", content: prompt }],
  };

  const message = await anthropic.messages.create(request);

  const toolUseBlock = message.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === "tool_use",
  );
  const text = message.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("\n\n");

  return {
    text:
      toolUseBlock && typeof toolUseBlock.input === "object"
        ? JSON.stringify(toolUseBlock.input, null, 2)
        : text,
    structuredData: toolUseBlock?.input,
    finishReason: message.stop_reason ?? undefined,
  };
}

// =============================================================================
// Gemini (Google)
// =============================================================================

async function callGemini(
  apiKey: string,
  prompt: string,
  systemPrompt: string | undefined,
  maxTokens: number,
  responseSchema?: JsonSchemaObject,
): Promise<CallLLMResult> {
  const genai = new GoogleGenerativeAI(apiKey);

  const model = genai.getGenerativeModel({
    model: "gemini-2.5-pro",
    ...(systemPrompt ? { systemInstruction: systemPrompt } : {}),
    generationConfig: {
      maxOutputTokens: maxTokens,
      // When a schema is provided, lock output to structured JSON
      ...(responseSchema
        ? {
            responseMimeType: "application/json",
            responseSchema: responseSchema as never,
          }
        : {}),
    },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text();
  const firstCandidate = result.response.candidates?.[0];
  let structuredData: unknown;

  if (responseSchema) {
    try {
      structuredData = parseStructuredJsonText(text, {
        provider: "gemini",
        finishReason: firstCandidate?.finishReason,
        finishMessage: firstCandidate?.finishMessage,
      });
    } catch {
      structuredData = undefined;
    }
  }

  return {
    text,
    structuredData,
    finishReason: firstCandidate?.finishReason,
    finishMessage: firstCandidate?.finishMessage,
  };
}
