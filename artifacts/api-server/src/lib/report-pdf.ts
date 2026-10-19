import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import PDFDocument from "pdfkit";
import type { loadRiskDetail } from "../routes/risks";
import type { toDocumentSummary } from "./document-summary";

export type ReportRisk = NonNullable<Awaited<ReturnType<typeof loadRiskDetail>>>;
export type ReportDocument = ReturnType<typeof toDocumentSummary>;

// Fonts ship with the API server so the report renders the same everywhere and
// supports characters (curly quotes, accented letters) the built-in PDF fonts lack.
function fontsDir(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  // dist/index.mjs -> ../assets ; src/lib/report-pdf.ts -> ../../assets
  const candidates = [path.resolve(here, "../assets/fonts"), path.resolve(here, "../../assets/fonts")];
  const found = candidates.find((d) => existsSync(path.join(d, "Geist-Regular.ttf")));
  if (!found) throw new Error("Report fonts are missing from the API server assets");
  return found;
}

const C = {
  navy: "#111a33",
  ink: "#1c2333",
  muted: "#667085",
  line: "#e4e7ec",
  soft: "#f5f7fa",
  teal: "#0a7d8a",
  severity: { critical: "#c4302b", high: "#d9731f", medium: "#b98a0c", low: "#3f8796" } as Record<string, string>,
  verified: "#2f7a52",
  partial: "#a07a0a",
  bad: "#c4302b",
};

const SEVERITY_LABEL: Record<string, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low" };
const STATUS_LABEL: Record<string, string> = { open: "Open", mitigating: "Being fixed", closed: "Closed" };
const ACTION_STATUS_LABEL: Record<string, string> = { open: "Open", in_progress: "In progress", submitted_for_review: "Submitted for review" };
const EVIDENCE_LABEL: Record<string, string> = {
  verified: "Quote verified",
  partially_verified: "Partly verified",
  unverified: "Quote not found",
  no_evidence: "No quote",
};
const KIND_LABEL: Record<string, string> = {
  missing_protection: "Missing protection",
  potential_risk: "Possible risk",
  actual_issue: "Actual issue",
};

const fmtDate = (d: Date | string | null | undefined) =>
  d ? new Date(d).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }) + " UTC" : "—";
const fmtDay = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : null;

/** Builds the PDF and resolves with its bytes. */
export function buildDocumentReport(doc: ReportDocument, risks: ReportRisk[], generatedAt = new Date()): Promise<Buffer> {
  const dir = fontsDir();
  const pdf = new PDFDocument({
    size: "A4",
    margins: { top: 56, bottom: 64, left: 56, right: 56 },
    bufferPages: true,
    info: { Title: `Risk report – ${doc.title}`, Author: "Veriscope", Subject: "Document risk report" },
  });
  pdf.registerFont("sans", path.join(dir, "Geist-Regular.ttf"));
  pdf.registerFont("bold", path.join(dir, "Geist-SemiBold.ttf"));
  pdf.registerFont("quote", path.join(dir, "NotoSerif-Italic.ttf"));

  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
  });

  const left = pdf.page.margins.left;
  const width = pdf.page.width - left - pdf.page.margins.right;
  const bottom = () => pdf.page.height - pdf.page.margins.bottom;
  const ensure = (h: number) => {
    if (pdf.y + h > bottom()) pdf.addPage();
  };

  // ---- Cover header
  pdf.rect(0, 0, pdf.page.width, 128).fill(C.navy);
  pdf.fillColor("#ffffff").font("bold").fontSize(11).text("VERISCOPE", left, 40, { characterSpacing: 2.5 });
  pdf.fillColor("#9fd9df").font("sans").fontSize(10).text("Document risk report", left, 58);
  pdf.fillColor("#ffffff").font("bold").fontSize(20).text(doc.title, left, 78, { width, height: 30, ellipsis: true });
  pdf.y = 150;

  const meta: [string, string][] = [
    ["File", doc.filename ?? "Pasted text"],
    ["Type", `${doc.sourceType.toUpperCase()}${doc.pageCount != null ? ` · ${doc.pageCount} pages` : ""} · ${doc.charCount.toLocaleString("en-GB")} characters`],
    ["Added", fmtDate(doc.createdAt)],
    ["Last AI check", doc.analyzedAt ? `${fmtDate(doc.analyzedAt)}${doc.analysisModel ? ` · ${doc.analysisModel}` : ""}` : "Not checked yet"],
    ["Report created", fmtDate(generatedAt)],
  ];
  for (const [k, v] of meta) {
    const y = pdf.y;
    pdf.font("sans").fontSize(9).fillColor(C.muted).text(k, left, y, { width: 100 });
    pdf.font("sans").fontSize(9.5).fillColor(C.ink).text(v, left + 100, y, { width: width - 100 });
    pdf.moveDown(0.35);
  }

  // ---- Summary tiles
  pdf.moveDown(0.8);
  const counts = (pred: (r: ReportRisk) => boolean) => risks.filter(pred).length;
  const quotesTotal = risks.reduce((n, r) => n + r.evidence.length, 0);
  const quotesVerified = risks.reduce((n, r) => n + r.evidence.filter((e) => e.verified).length, 0);
  const tiles: [string, string][] = [
    ["Risks found", String(risks.length)],
    ["Open", String(counts((r) => r.status !== "closed"))],
    ["Need your review", String(counts((r) => r.reviewRequired))],
    ["Quotes verified", `${quotesVerified} / ${quotesTotal}`],
  ];
  const gap = 10;
  const tw = (width - gap * (tiles.length - 1)) / tiles.length;
  const ty = pdf.y;
  tiles.forEach(([label, value], i) => {
    const x = left + i * (tw + gap);
    pdf.roundedRect(x, ty, tw, 58, 6).fillAndStroke(C.soft, C.line);
    pdf.fillColor(C.muted).font("sans").fontSize(8.5).text(label, x + 12, ty + 11, { width: tw - 24 });
    pdf.fillColor(C.navy).font("bold").fontSize(18).text(value, x + 12, ty + 26, { width: tw - 24 });
  });
  pdf.y = ty + 72;

  // Severity breakdown bar
  const sevOrder = ["critical", "high", "medium", "low"];
  if (risks.length) {
    const by = sevOrder.map((s) => [s, counts((r) => r.severity === s)] as const).filter(([, n]) => n > 0);
    const barY = pdf.y;
    let x = left;
    by.forEach(([s, n]) => {
      const w = (width * n) / risks.length;
      pdf.rect(x, barY, w, 8).fill(C.severity[s]!);
      x += w;
    });
    pdf.y = barY + 14;
    let lx = left;
    by.forEach(([s, n]) => {
      pdf.circle(lx + 3.5, pdf.y + 5, 3.5).fill(C.severity[s]!);
      const label = `${SEVERITY_LABEL[s]} ${n}`;
      pdf.fillColor(C.ink).font("sans").fontSize(9).text(label, lx + 11, pdf.y, { lineBreak: false });
      lx += 11 + pdf.widthOfString(label) + 16;
    });
    pdf.y += 20;
  }

  pdf.moveDown(0.6);
  pdf.font("sans").fontSize(8.5).fillColor(C.muted).text(
    "How to read this report: text in italics between quotation marks is copied from the document. " +
      "\"Quote verified\" means it was found word-for-word in the document text; a quote that was not found must not be relied on. " +
      "Everything else is the AI's explanation, not a quote. A risk can only be closed after a recorded human approval.",
    left, pdf.y, { width, lineGap: 1.5 },
  );

  // ---- Risks
  pdf.moveDown(1.2);
  if (!risks.length) {
    pdf.font("bold").fontSize(12).fillColor(C.navy).text(
      doc.status === "analyzed" ? "No clear risks were found in this document." : "This document has not been checked for risks yet.",
      left, pdf.y, { width },
    );
  }

  const section = (label: string, body: string | null | undefined) => {
    if (!body) return;
    ensure(40);
    pdf.font("bold").fontSize(9).fillColor(C.muted).text(label.toUpperCase(), left + 14, pdf.y, { width: width - 14, characterSpacing: 0.6 });
    pdf.moveDown(0.15);
    pdf.font("sans").fontSize(10).fillColor(C.ink).text(body, left + 14, pdf.y, { width: width - 14, lineGap: 2 });
    pdf.moveDown(0.6);
  };

  risks.forEach((r, i) => {
    ensure(110);
    if (i > 0) {
      pdf.moveTo(left, pdf.y).lineTo(left + width, pdf.y).lineWidth(0.6).strokeColor(C.line).stroke();
      pdf.moveDown(0.9);
    }
    const sev = C.severity[r.severity] ?? C.muted;
    const titleY = pdf.y;
    pdf.font("bold").fontSize(9).fillColor(C.muted).text(`RISK ${i + 1} OF ${risks.length}`, left + 14, titleY, { characterSpacing: 0.8 });
    pdf.font("bold").fontSize(13).fillColor(C.navy).text(r.title, left + 14, pdf.y + 2, { width: width - 14, lineGap: 1 });
    pdf.rect(left, titleY, 4, pdf.y - titleY).fill(sev);
    pdf.moveDown(0.35);

    // Tag line
    const tags: { text: string; color: string }[] = [
      { text: SEVERITY_LABEL[r.severity] ?? r.severity, color: sev },
      { text: STATUS_LABEL[r.status] ?? r.status, color: C.navy },
      { text: EVIDENCE_LABEL[r.evidenceStatus] ?? r.evidenceStatus, color: r.evidenceStatus === "verified" ? C.verified : r.evidenceStatus === "partially_verified" ? C.partial : C.bad },
      { text: r.category, color: C.muted },
    ];
    if (r.riskKind) tags.push({ text: KIND_LABEL[r.riskKind] ?? r.riskKind, color: C.muted });
    if (r.likelihood) tags.push({ text: `Likelihood: ${SEVERITY_LABEL[r.likelihood] ?? r.likelihood}`, color: C.muted });
    if (r.reviewRequired) tags.push({ text: "Needs your review", color: C.bad });
    let tx = left + 14;
    let tyy = pdf.y;
    pdf.font("bold").fontSize(8.5);
    for (const t of tags) {
      const w = pdf.widthOfString(t.text) + 14;
      if (tx + w > left + width) { tx = left + 14; tyy += 20; }
      pdf.roundedRect(tx, tyy, w, 15, 4).lineWidth(0.8).strokeColor(t.color).stroke();
      pdf.fillColor(t.color).text(t.text, tx + 7, tyy + 3.5, { lineBreak: false });
      tx += w + 6;
    }
    pdf.y = tyy + 24;

    section("What the AI found", r.description);
    section("Why it matters", r.businessImpact);
    section("Why this severity", r.severityReason);

    // Quotes
    if (r.evidence.length) {
      // Keep the heading on the same page as the first quote.
      pdf.font("quote").fontSize(10);
      ensure(pdf.heightOfString(`“${r.evidence[0]!.quote.trim()}”`, { width: width - 40, lineGap: 2 }) + 50);
      pdf.font("bold").fontSize(9).fillColor(C.muted).text("QUOTES FROM THE DOCUMENT", left + 14, pdf.y, { characterSpacing: 0.6 });
      pdf.moveDown(0.3);
      for (const e of r.evidence) {
        const qText = `“${e.quote.trim()}”`;
        pdf.font("quote").fontSize(10);
        const h = pdf.heightOfString(qText, { width: width - 40, lineGap: 2 });
        ensure(h + 30);
        const qy = pdf.y;
        const color = e.verified ? C.verified : C.bad;
        pdf.font("quote").fontSize(10).fillColor(C.ink).text(qText, left + 28, qy, { width: width - 40, lineGap: 2 });
        pdf.rect(left + 18, qy, 2, pdf.y - qy).fill(color);
        const label = e.verified
          ? `Verified${e.matchType === "normalized" ? " (spacing/line breaks normalised)" : ""}${e.pageNumber ? ` · page ${e.pageNumber}` : ""}${e.matchCount > 1 ? ` · appears ${e.matchCount} times` : ""}`
          : "Not found in the document — do not rely on this quote";
        pdf.font("sans").fontSize(8.5).fillColor(color).text(label, left + 28, pdf.y + 2, { width: width - 40 });
        pdf.moveDown(0.6);
      }
    }
    if (r.interpretationNote) section("Interpretation (not a quote)", r.interpretationNote);

    section("Recommended action", r.recommendedMitigation);

    if (r.reviewRequired && r.reviewReasons.length) {
      section("Why it needs your review", r.reviewReasons.map((x) => `•  ${x}`).join("\n"));
    }
    if (r.reviewNotes) section("Points to check", r.reviewNotes);

    if (r.actions.length) {
      ensure(40);
      pdf.font("bold").fontSize(9).fillColor(C.muted).text("ACTIONS", left + 14, pdf.y, { characterSpacing: 0.6 });
      pdf.moveDown(0.2);
      for (const a of r.actions) {
        const parts = [ACTION_STATUS_LABEL[a.status] ?? a.status, a.owner ? `Owner: ${a.owner}` : null, fmtDay(a.dueDate) ? `Due ${fmtDay(a.dueDate)}` : null].filter(Boolean);
        ensure(30);
        pdf.font("sans").fontSize(10).fillColor(C.ink).text(`•  ${a.description}`, left + 14, pdf.y, { width: width - 14 });
        pdf.font("sans").fontSize(8.5).fillColor(C.muted).text(parts.join(" · "), left + 26, pdf.y + 1, { width: width - 26 });
        pdf.moveDown(0.4);
      }
      pdf.moveDown(0.3);
    }

    if (r.statusChanges.length) {
      section(
        "Status history",
        r.statusChanges
          .map((s) => `•  ${fmtDate(s.createdAt)} — ${STATUS_LABEL[s.fromStatus] ?? s.fromStatus} → ${STATUS_LABEL[s.toStatus] ?? s.toStatus} by ${s.changedBy}${s.note ? `: ${s.note}` : ""}`)
          .join("\n"),
      );
    }
    pdf.moveDown(0.4);
  });

  // ---- Footer on every page
  const range = pdf.bufferedPageRange();
  for (let p = range.start; p < range.start + range.count; p++) {
    pdf.switchToPage(p);
    const fy = pdf.page.height - 40;
    const saved = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    pdf.moveTo(left, fy - 8).lineTo(left + width, fy - 8).lineWidth(0.5).strokeColor(C.line).stroke();
    pdf.font("sans").fontSize(8).fillColor(C.muted)
      .text(`Veriscope · ${doc.title}`, left, fy, { width: width - 80, lineBreak: false, ellipsis: true })
      .text(`Page ${p - range.start + 1} of ${range.count}`, left + width - 80, fy, { width: 80, align: "right", lineBreak: false });
    pdf.page.margins.bottom = saved;
  }

  pdf.end();
  return done;
}
