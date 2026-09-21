const BOM = String.fromCharCode(0xfeff);

/** Picks the delimiter that appears most on the first non-empty line. */
function detectDelimiter(text: string): string {
  const firstLine = text.split(/\r\n|\n|\r/).find((l) => l.trim() !== '') ?? '';
  let best = ',';
  let bestCount = 0;
  for (const candidate of [',', ';', '\t']) {
    const count = firstLine.split(candidate).length - 1;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  return best;
}

/**
 * RFC 4180 CSV: quoted fields, escaped quotes, commas and line breaks inside quotes, and
 * CRLF / LF / CR line endings. Also tolerates a BOM and semicolon- or tab-separated files.
 * Rows made only of empty fields are dropped.
 */
export function parseCsv(input: string): string[][] {
  const text = input.startsWith(BOM) ? input.slice(1) : input;
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;

  const endField = () => {
    row.push(field);
    field = '';
  };
  const endRow = () => {
    endField();
    if (row.some((f) => f.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      endField();
    } else if (ch === '\n') {
      endRow();
    } else if (ch === '\r') {
      if (text[i + 1] === '\n') i++;
      endRow();
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) endRow();
  return rows;
}
