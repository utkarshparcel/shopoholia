/**
 * Minimal single-page PDF for invoice export (N18).
 * No external deps — enough for merchant / GSTIN / total archival share.
 */

export type InvoicePdfFields = {
  merchant: string;
  purchasedAt: string;
  totalLabel: string;
  gstin: string | null;
  receiptId: string;
  currency?: string;
};

function escapePdfText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function utf8Length(s: string): number {
  return new TextEncoder().encode(s).length;
}

/** Build a tiny PDF (Helvetica) summarizing an invoice / receipt. */
export function buildInvoicePdfBytes(fields: InvoicePdfFields): Uint8Array {
  const lines = [
    "WORN invoice export",
    `Merchant: ${fields.merchant}`,
    `Date: ${fields.purchasedAt}`,
    `Total: ${fields.totalLabel}`,
    `GSTIN: ${fields.gstin ?? "—"}`,
    `Receipt: ${fields.receiptId}`,
  ];

  const contentParts: string[] = ["BT", "/F1 12 Tf", "50 780 Td", "16 TL"];
  lines.forEach((line, i) => {
    if (i === 0) {
      contentParts.push(`(${escapePdfText(line)}) Tj`);
    } else {
      contentParts.push("T*", `(${escapePdfText(line)}) Tj`);
    }
  });
  contentParts.push("ET");
  const stream = contentParts.join("\n");

  const objects: string[] = [];
  objects.push("1 0 obj<< /Type /Catalog /Pages 2 0 R >>endobj\n");
  objects.push("2 0 obj<< /Type /Pages /Kids [3 0 R] /Count 1 >>endobj\n");
  objects.push(
    "3 0 obj<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>endobj\n",
  );
  objects.push(
    `4 0 obj<< /Length ${utf8Length(stream)} >>stream\n${stream}\nendstream\nendobj\n`,
  );
  objects.push("5 0 obj<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>endobj\n");

  let body = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(utf8Length(body));
    body += obj;
  }
  const xrefStart = utf8Length(body);
  body += `xref\n0 ${objects.length + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    body += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer<< /Size ${objects.length + 1} /Root 1 0 R >>\n`;
  body += `startxref\n${xrefStart}\n%%EOF\n`;

  return new TextEncoder().encode(body);
}
