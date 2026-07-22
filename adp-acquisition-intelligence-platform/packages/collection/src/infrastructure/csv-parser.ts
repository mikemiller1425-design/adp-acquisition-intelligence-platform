export type ParsedCsvRow = {
  rowNumber: number;
  values: string[];
};

export async function* parseCsvRows(
  text: string,
  delimiter: ',' | '\t' | ';' | '|',
): AsyncGenerator<ParsedCsvRow> {
  let rowNumber = 1;
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"') {
      if (inQuotes && next === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && char === delimiter) {
      row.push(cell);
      cell = '';
      continue;
    }
    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(cell);
      yield { rowNumber, values: row };
      rowNumber += 1;
      row = [];
      cell = '';
      continue;
    }
    cell += char;
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    yield { rowNumber, values: row };
  }
}

export async function parseCsvObjects(
  text: string,
  delimiter: ',' | '\t' | ';' | '|',
): Promise<Array<{ rowNumber: number; raw: Record<string, string> }>> {
  const rows: Array<{ rowNumber: number; raw: Record<string, string> }> = [];
  let headers: string[] | null = null;
  for await (const row of parseCsvRows(text, delimiter)) {
    if (headers === null) {
      headers = row.values.map((value) => value.trim());
      continue;
    }
    const raw: Record<string, string> = {};
    for (const [index, header] of headers.entries()) {
      raw[header] = row.values[index] ?? '';
    }
    rows.push({ rowNumber: row.rowNumber, raw });
  }
  return rows;
}
