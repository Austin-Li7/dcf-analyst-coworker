import test from "node:test";
import assert from "node:assert/strict";

import { parseStructuredJsonText } from "./llm-service.ts";

test("parseStructuredJsonText throws a truncation-specific error for unterminated JSON", () => {
  assert.throws(
    () =>
      parseStructuredJsonText('{"schema_version":"v5.5","company_name":"Apple","claims":["cut off', {
        provider: "gemini",
        finishReason: "MAX_TOKENS",
      }),
    /truncated because Gemini hit MAX_TOKENS/i,
  );
});

test("parseStructuredJsonText parses valid JSON text", () => {
  const parsed = parseStructuredJsonText('{"schema_version":"v5.5","company_name":"Apple"}', {
    provider: "gemini",
    finishReason: "STOP",
  });

  assert.deepEqual(parsed, {
    schema_version: "v5.5",
    company_name: "Apple",
  });
});
