/**
 * Server-side PDF text extraction using `unpdf`.
 *
 * `unpdf` bundles a serverless-compatible build of pdf.js that does NOT
 * spawn Web Workers — it runs entirely on the main Node.js thread.
 * This makes it safe for Next.js API routes, RSC, and edge functions.
 */

import { extractText, getDocumentProxy } from "unpdf";

/**
 * Extract text from a PDF.
 * @param data - Raw PDF bytes (ArrayBuffer, Uint8Array, or Buffer).
 * @param maxPages - Maximum number of pages to extract (default 120).
 * @returns Concatenated plain text from the extracted pages.
 */
export async function extractPdfText(
  data: ArrayBuffer | Uint8Array | Buffer,
  maxPages = 120,
): Promise<string> {
  // Ensure we have a clean Uint8Array (unpdf accepts this directly)
  const uint8 =
    data instanceof Uint8Array && !(data instanceof Buffer)
      ? data
      : new Uint8Array(
          data instanceof ArrayBuffer
            ? data
            : data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        );

  // If the document is within our page limit, use the simple extractText API
  // For large docs, open a proxy so we can read only the first N pages
  const proxy = await getDocumentProxy(uint8);

  try {
    if (proxy.numPages <= maxPages) {
      // Fast path — extract everything at once
      const result = await extractText(proxy, { mergePages: true });
      return result.text;
    }

    // Slow path — extract only the first `maxPages` pages individually
    const textParts: string[] = [];
    for (let i = 1; i <= maxPages; i++) {
      const page = await proxy.getPage(i);
      const content = await page.getTextContent();
      const pageText = content.items
        .filter((item) => "str" in item)
        .map((item) => (item as { str: string }).str)
        .join(" ");
      if (pageText.trim()) {
        textParts.push(pageText);
      }
    }
    return textParts.join("\n\n");
  } finally {
    await proxy.destroy();
  }
}
