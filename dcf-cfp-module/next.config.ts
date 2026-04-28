import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ["127.0.0.1"],
  // Keep these as server-external so Next.js/Webpack never tries to bundle
  // packages that include native binaries, vendored WASM, or internal
  // ESM workspaces (documind ships as plain .js ESM with no TS declarations).
  serverExternalPackages: [
    "unpdf",
    "yahoo-finance2",
    // documind and its native-module dependency chain
    "documind",
    "core",          // documind internal workspace package
    "sharp",
    "pdf2pic",
    "tesseract.js",
    "libreoffice-convert",
  ],
};

export default nextConfig;
