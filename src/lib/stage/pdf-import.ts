/** PDF.js entra só quando alguém importa um arquivo. OCR idem. */

export type PdfExtract = {
  text: string;
  pageCount: number;
  chars: number;
};

type TextItem = { str?: string; transform?: number[] };

export async function extractPdfText(data: ArrayBuffer): Promise<PdfExtract> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const lines: string[] = [];
  for (let pageNo = 1; pageNo <= doc.numPages; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const content = await page.getTextContent();
    const items = (content.items as TextItem[])
      .filter((item) => item.str && item.transform)
      .map((item) => ({
        str: item.str ?? "",
        x: item.transform?.[4] ?? 0,
        y: item.transform?.[5] ?? 0,
      }));
    const rows: { y: number; parts: { x: number; str: string }[] }[] = [];
    for (const item of items) {
      const row = rows.find((r) => Math.abs(r.y - item.y) < 3);
      if (row) row.parts.push({ x: item.x, str: item.str });
      else rows.push({ y: item.y, parts: [{ x: item.x, str: item.str }] });
    }
    rows.sort((a, b) => b.y - a.y);
    for (const row of rows) {
      row.parts.sort((a, b) => a.x - b.x);
      let text = "";
      let lastX = 0;
      row.parts.forEach((part, index) => {
        if (index > 0) {
          const gap = part.x - lastX;
          text += gap > 12 ? " ".repeat(Math.min(12, Math.max(1, Math.round(gap / 6)))) : "";
        }
        text += part.str;
        lastX = part.x + part.str.length * 4.2;
      });
      lines.push(text.replace(/\s+$/g, ""));
    }
    lines.push("");
  }
  const text = lines.join("\n");
  return { text, pageCount: doc.numPages, chars: text.replace(/\s/g, "").length };
}

export async function renderPdfPages(data: ArrayBuffer, maxPages = 6): Promise<string[]> {
  const pdfjs = await import("pdfjs-dist");
  const worker = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const urls: string[] = [];
  const count = Math.min(maxPages, doc.numPages);
  for (let pageNo = 1; pageNo <= count; pageNo += 1) {
    const page = await doc.getPage(pageNo);
    const viewport = page.getViewport({ scale: 1.35 });
    const canvas = document.createElement("canvas");
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) continue;
    await page.render({ canvasContext: ctx, viewport }).promise;
    urls.push(canvas.toDataURL("image/jpeg", 0.72));
  }
  return urls;
}

export async function ocrPdf(data: ArrayBuffer): Promise<string> {
  const pdfjs = await import("pdfjs-dist");
  const workerSrc = await import("pdfjs-dist/build/pdf.worker.min.mjs?url");
  pdfjs.GlobalWorkerOptions.workerSrc = workerSrc.default;
  const doc = await pdfjs.getDocument({ data: data.slice(0) }).promise;
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("por+eng");
  const chunks: string[] = [];
  try {
    const count = Math.min(doc.numPages, 4);
    for (let pageNo = 1; pageNo <= count; pageNo += 1) {
      const page = await doc.getPage(pageNo);
      const viewport = page.getViewport({ scale: 2 });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      const result = await worker.recognize(canvas);
      chunks.push(result.data.text);
    }
  } finally {
    await worker.terminate();
  }
  return chunks.join("\n");
}
