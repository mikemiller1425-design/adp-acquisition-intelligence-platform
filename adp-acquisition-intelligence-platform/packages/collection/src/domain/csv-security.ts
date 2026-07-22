import { AppError } from '@adp/platform';

export type CsvSecurityLimits = {
  maxBytes: number;
  maxRows: number;
  maxColumns: number;
  maxCellBytes: number;
};

export type CsvSecurityResult = {
  filename: string;
  contentType: string;
  delimiter: ',' | '\t' | ';' | '|';
  hasBom: boolean;
  rowCount: number;
  columnCount: number;
  text: string;
};

const allowedContentTypes = new Set([
  'text/csv',
  'text/plain',
  'application/csv',
  'application/vnd.ms-excel',
]);

export function validateCsvArtifact(input: {
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  limits: CsvSecurityLimits;
}): CsvSecurityResult {
  const filename = safeCsvFilename(input.filename);
  const contentType = normalizeContentType(input.contentType);
  if (!allowedContentTypes.has(contentType)) {
    throw validation('Unsupported CSV content type', { contentType });
  }
  if (input.bytes.byteLength > input.limits.maxBytes) {
    throw validation('CSV upload exceeds maximum size', {
      sizeBytes: input.bytes.byteLength,
      maxBytes: input.limits.maxBytes,
    });
  }
  if (input.bytes.includes(0)) {
    throw validation('CSV contains null bytes');
  }
  if (looksBinary(input.bytes)) {
    throw validation('CSV appears to be binary data');
  }
  const hasBom = input.bytes[0] === 0xef && input.bytes[1] === 0xbb && input.bytes[2] === 0xbf;
  const text = new TextDecoder('utf-8', { fatal: true }).decode(input.bytes).replace(/^\uFEFF/, '');
  const delimiter = detectDelimiter(text);
  const shape = inspectCsvShape(text, delimiter, input.limits);
  return { filename, contentType, delimiter, hasBom, text, ...shape };
}

export function safeCsvFilename(filename: string): string {
  if (filename.includes('/') || filename.includes('\\')) {
    throw validation('CSV filename must not contain path separators', { filename });
  }
  const cleaned = filename.normalize('NFKC').trim();
  if (cleaned === '' || cleaned === '.' || cleaned === '..' || cleaned.includes('\0')) {
    throw validation('Invalid CSV filename');
  }
  const safe = cleaned.replace(/[^A-Za-z0-9._-]/g, '_');
  if (!safe.toLowerCase().endsWith('.csv')) {
    throw validation('CSV filename must end in .csv', { filename });
  }
  return safe;
}

export function sanitizeReportCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

export function inspectCsvShape(
  text: string,
  delimiter: CsvSecurityResult['delimiter'],
  limits: CsvSecurityLimits,
): { rowCount: number; columnCount: number } {
  let rowCount = 0;
  let columnCount = 0;
  let currentColumns = 1;
  let inQuotes = false;
  let cellBytes = 0;
  const encoder = new TextEncoder();

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      currentColumns += 1;
      cellBytes = 0;
      if (currentColumns > limits.maxColumns) {
        throw validation('CSV exceeds maximum column count', { maxColumns: limits.maxColumns });
      }
      continue;
    }
    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      rowCount += 1;
      columnCount = Math.max(columnCount, currentColumns);
      currentColumns = 1;
      cellBytes = 0;
      if (rowCount > limits.maxRows) {
        throw validation('CSV exceeds maximum row count', { maxRows: limits.maxRows });
      }
      continue;
    }
    cellBytes += encoder.encode(char).byteLength;
    if (cellBytes > limits.maxCellBytes) {
      throw validation('CSV contains an oversized cell', { maxCellBytes: limits.maxCellBytes });
    }
  }
  if (inQuotes) throw validation('CSV contains malformed quotes');
  if (text.length > 0 && !text.endsWith('\n') && !text.endsWith('\r')) {
    rowCount += 1;
    columnCount = Math.max(columnCount, currentColumns);
  }
  if (rowCount === 0) throw validation('CSV is empty');
  return { rowCount, columnCount };
}

function detectDelimiter(text: string): CsvSecurityResult['delimiter'] {
  const firstLine = text.split(/\r?\n/, 1)[0] ?? '';
  const candidates: CsvSecurityResult['delimiter'][] = [',', '\t', ';', '|'];
  return (
    candidates
      .map((delimiter) => ({
        delimiter,
        count: firstLine.split(delimiter).length - 1,
      }))
      .sort((left, right) => right.count - left.count)[0]?.delimiter ?? ','
  );
}

function looksBinary(bytes: Uint8Array): boolean {
  const sample = bytes.slice(0, Math.min(bytes.length, 512));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte < 7 || (byte > 14 && byte < 32)) suspicious += 1;
  }
  return sample.length > 0 && suspicious / sample.length > 0.05;
}

function normalizeContentType(contentType: string): string {
  return contentType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function validation(message: string, details?: Record<string, unknown>): AppError {
  return new AppError({ code: 'VALIDATION_FAILED', message, details });
}
