import { extractText, getDocumentProxy } from "unpdf";
import mammoth from "mammoth";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
// Upper bound on stored/analyzed text. Larger documents are rejected rather
// than silently truncated, so no content is ever skipped without the user knowing.
export const MAX_DOCUMENT_CHARS = 400_000;
// A PDF with less extractable text than this is treated as image-only.
const MIN_MEANINGFUL_CHARS = 20;

export type SourceType = "text" | "pdf" | "docx";

export interface ExtractedDocument {
  text: string;
  sourceType: SourceType;
  // Character offset where each page starts (PDF only).
  pageOffsets: number[] | null;
}

/** An extraction failure that is safe to show to the user. */
export class ExtractionError extends Error {
  constructor(
    readonly status: 413 | 415 | 422,
    message: string,
  ) {
    super(message);
    this.name = "ExtractionError";
  }
}

const TEXT_EXTENSIONS = new Set(["txt", "md", "markdown", "csv"]);

function extensionOf(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

function normalizeText(raw: string): string {
  // Unify line endings and drop NULs; everything else is kept verbatim so
  // evidence quotes can be matched against exactly what the user supplied.
  return raw.replace(/\r\n?/g, "\n").replace(/\u0000/g, "");
}

function nonWhitespaceLength(s: string): number {
  return s.replace(/\s+/g, "").length;
}

export function assertTextWithinLimits(text: string): void {
  if (nonWhitespaceLength(text) === 0) {
    throw new ExtractionError(422, "The document contains no text.");
  }
  if (text.length > MAX_DOCUMENT_CHARS) {
    throw new ExtractionError(
      413,
      `The document has ${text.length.toLocaleString("en-US")} characters of text; the limit is ${MAX_DOCUMENT_CHARS.toLocaleString("en-US")}. Split it into smaller documents.`,
    );
  }
}

async function extractPdf(buffer: Buffer): Promise<ExtractedDocument> {
  let pages: string[];
  try {
    const pdf = await getDocumentProxy(new Uint8Array(buffer));
    pages = (await extractText(pdf, { mergePages: false })).text;
  } catch (err) {
    const name = (err as { name?: string })?.name;
    if (name === "PasswordException") {
      throw new ExtractionError(422, "This PDF is password-protected. Remove the password and upload it again.");
    }
    throw new ExtractionError(422, "This PDF could not be read. The file may be corrupted or incomplete.");
  }

  const pageOffsets: number[] = [];
  let text = "";
  pages.forEach((page, i) => {
    if (i > 0) text += "\n\n";
    pageOffsets.push(text.length);
    text += normalizeText(page);
  });

  if (nonWhitespaceLength(text) < MIN_MEANINGFUL_CHARS) {
    throw new ExtractionError(
      422,
      `No text could be extracted from this PDF (${pages.length} page${pages.length === 1 ? "" : "s"}). It is probably a scanned image. Veriscope does not perform OCR, so it cannot read this document; upload a PDF with selectable text or a DOCX instead.`,
    );
  }
  return { text, sourceType: "pdf", pageOffsets };
}

async function extractDocx(buffer: Buffer): Promise<ExtractedDocument> {
  let raw: string;
  try {
    raw = (await mammoth.extractRawText({ buffer })).value;
  } catch {
    throw new ExtractionError(422, "This DOCX file could not be read. The file may be corrupted or not a real Word document.");
  }
  return { text: normalizeText(raw).trim(), sourceType: "docx", pageOffsets: null };
}

function extractPlainText(buffer: Buffer): ExtractedDocument {
  let raw: string;
  try {
    raw = new TextDecoder("utf-8", { fatal: true }).decode(buffer);
  } catch {
    throw new ExtractionError(422, "This text file is not valid UTF-8 text.");
  }
  return { text: normalizeText(raw.replace(/^\uFEFF/, "")).trim(), sourceType: "text", pageOffsets: null };
}

/**
 * Extract text from an uploaded file. The file's real format is checked from
 * its leading bytes, not only its extension, so a renamed file is caught.
 */
export async function extractFromUpload(buffer: Buffer, filename: string): Promise<ExtractedDocument> {
  if (buffer.length === 0) throw new ExtractionError(422, "The file is empty.");

  const ext = extensionOf(filename);
  const isPdfBytes = buffer.subarray(0, 5).toString("latin1") === "%PDF-";
  const isZipBytes = buffer[0] === 0x50 && buffer[1] === 0x4b && buffer[2] === 0x03 && buffer[3] === 0x04;

  let result: ExtractedDocument;
  if (ext === "pdf") {
    if (!isPdfBytes) throw new ExtractionError(422, "This file has a .pdf extension but is not a valid PDF.");
    result = await extractPdf(buffer);
  } else if (ext === "docx") {
    if (!isZipBytes) throw new ExtractionError(422, "This file has a .docx extension but is not a valid Word document.");
    result = await extractDocx(buffer);
  } else if (TEXT_EXTENSIONS.has(ext)) {
    result = extractPlainText(buffer);
  } else if (ext === "doc") {
    throw new ExtractionError(415, "Legacy .doc files are not supported. Save the file as .docx or PDF and upload it again.");
  } else {
    throw new ExtractionError(415, `Unsupported file type${ext ? ` ".${ext}"` : ""}. Upload a PDF, DOCX or plain-text (.txt, .md) file.`);
  }

  assertTextWithinLimits(result.text);
  return result;
}
