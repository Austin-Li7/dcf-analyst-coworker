import test from "node:test";
import assert from "node:assert/strict";

import {
  inferTickerFromCompanyName,
  normalizeCompanyNameForTicker,
  normalizeTickerInput,
} from "./ticker-lookup.ts";

test("infers a ticker from saved Step 1 company names", () => {
  assert.equal(inferTickerFromCompanyName("Apple Inc."), "AAPL");
  assert.equal(inferTickerFromCompanyName("Microsoft Corporation"), "MSFT");
  assert.equal(inferTickerFromCompanyName("Alphabet Inc."), "GOOGL");
});

test("normalizes ticker and company name inputs for WACC handoff", () => {
  assert.equal(normalizeTickerInput(" aapl "), "AAPL");
  assert.equal(normalizeCompanyNameForTicker("Apple Inc."), "apple");
  assert.equal(normalizeCompanyNameForTicker("NVIDIA Corporation"), "nvidia");
});
