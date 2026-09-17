if (typeof Promise.withResolvers !== 'function') {
  Promise.withResolvers = function withResolvers() {
    let resolve;
    let reject;
    const promise = new Promise((promiseResolve, promiseReject) => {
      resolve = promiseResolve;
      reject = promiseReject;
    });
    return { promise, resolve, reject };
  };
}
if (typeof Promise.try !== 'function') {
  Promise.try = function promiseTry(callback, ...argumentsValue) {
    return new Promise(resolve => resolve(callback(...argumentsValue)));
  };
}
if (typeof URL.parse !== 'function') {
  URL.parse = function parseUrl(url, base) {
    try { return new URL(url, base); } catch { return null; }
  };
}
if (typeof Array.prototype.findLast !== 'function') {
  Object.defineProperty(Array.prototype, 'findLast', {
    configurable: true,
    writable: true,
    value(predicate, thisArgument) {
      for (let index = this.length - 1; index >= 0; index--) {
        if (predicate.call(thisArgument, this[index], index, this)) return this[index];
      }
      return undefined;
    },
  });
}

const PDF_MODULE_URL = new URL('./pdf.min.mjs', import.meta.url).href;
const PDF_WORKER_URL = new URL('./pdf.worker.compat.mjs', import.meta.url).href;

const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const upper = value => clean(value).toUpperCase();
const xml = value => String(value ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function parseLoopZone(value) {
  const text = upper(value).replace(/[‐‑‒–—−]/g, '-');
  const match = text.match(/\b(D\s*\d+[A-Z]?)\s*(?:\/|\\|[-–—]|\s+)\s*(?:Z(?:ONE)?\s*)?(\d+[A-Z]?)\b/i)
    || text.match(/\b(D\s*\d+[A-Z]?)\s*\/\s*Z\s*(\d+[A-Z]?)\b/i);
  if (!match) return null;
  return { loop: match[1].replace(/\s+/g, ''), zone: match[2].replace(/^Z/i, '') };
}

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    if (character === '"') {
      if (quoted && text[index + 1] === '"') { cell += '"'; index++; }
      else quoted = !quoted;
    } else if ((character === ',' || character === '\t' || character === ';') && !quoted) {
      row.push(clean(cell)); cell = '';
    } else if ((character === '\n' || character === '\r') && !quoted) {
      if (character === '\r' && text[index + 1] === '\n') index++;
      row.push(clean(cell)); cell = '';
      if (row.some(Boolean)) rows.push(row);
      row = [];
    } else cell += character;
  }
  row.push(clean(cell));
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function columnNumber(reference) {
  const letters = String(reference || '').match(/[A-Z]+/i)?.[0]?.toUpperCase() || 'A';
  return [...letters].reduce((total, character) => total * 26 + character.charCodeAt(0) - 64, 0) - 1;
}

function parseXml(text) {
  const documentValue = new DOMParser().parseFromString(text, 'application/xml');
  const failure = documentValue.querySelector('parsererror');
  if (failure) throw new Error('The Excel workbook contains XML that could not be read.');
  return documentValue;
}

async function workbookRows(file) {
  if (!globalThis.JSZip) throw new Error('The Excel reader is unavailable. Reload the tool and try again.');
  const zip = await globalThis.JSZip.loadAsync(await file.arrayBuffer());
  const workbookFile = zip.file('xl/workbook.xml');
  const relationFile = zip.file('xl/_rels/workbook.xml.rels');
  if (!workbookFile || !relationFile) throw new Error('This is not a readable Excel workbook.');
  const workbook = parseXml(await workbookFile.async('text'));
  const relationships = parseXml(await relationFile.async('text'));
  const relationMap = new Map([...relationships.querySelectorAll('Relationship')].map(node => [node.getAttribute('Id'), node.getAttribute('Target')]));
  const sharedFile = zip.file('xl/sharedStrings.xml');
  const shared = sharedFile
    ? [...parseXml(await sharedFile.async('text')).querySelectorAll('si')].map(node => clean([...node.querySelectorAll('t')].map(item => item.textContent || '').join('')))
    : [];
  const sheets = [...workbook.querySelectorAll('sheet')];
  for (const sheet of sheets) {
    const relationId = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
    const target = relationMap.get(relationId);
    if (!target) continue;
    const normalized = target.startsWith('/') ? target.slice(1) : `xl/${target.replace(/^\.\//, '')}`;
    const sheetFile = zip.file(normalized.replace(/xl\/\.\.\//g, ''));
    if (!sheetFile) continue;
    const documentValue = parseXml(await sheetFile.async('text'));
    const rows = [...documentValue.querySelectorAll('sheetData row')].map(rowNode => {
      const values = [];
      for (const cell of rowNode.querySelectorAll('c')) {
        const index = columnNumber(cell.getAttribute('r'));
        const type = cell.getAttribute('t');
        const raw = cell.querySelector('v')?.textContent || '';
        let value = raw;
        if (type === 's') value = shared[Number(raw)] || '';
        else if (type === 'inlineStr') value = [...cell.querySelectorAll('t')].map(item => item.textContent || '').join('');
        values[index] = clean(value);
      }
      return values;
    }).filter(row => row.some(Boolean));
    if (rows.length) return rows;
  }
  throw new Error('No populated worksheet was found in the workbook.');
}

function headerIndex(headers, expressions) {
  return headers.findIndex(header => expressions.some(expression => expression.test(upper(header))));
}

export function parseBluebeamRows(rows) {
  if (!Array.isArray(rows) || !rows.length) throw new Error('The Bluebeam import is empty.');
  let headerRow = -1, combined = -1, loopColumn = -1, zoneColumn = -1, quantityColumn = -1;
  for (let index = 0; index < Math.min(rows.length, 30); index++) {
    const headers = rows[index].map(upper);
    combined = headerIndex(headers, [/LOOP.*ZONE/, /DALI.*TAG/, /^TAG$/, /ADDRESS/]);
    loopColumn = headerIndex(headers, [/^LOOP$/, /CONTROL.*LOOP/, /DALI.*LOOP/]);
    zoneColumn = headerIndex(headers, [/^ZONE$/, /CUSTOMER.*ZONE/]);
    quantityColumn = headerIndex(headers, [/^QTY$/, /QUANTITY/, /COUNT/, /FIXTURE.*QTY/]);
    if ((combined >= 0 || (loopColumn >= 0 && zoneColumn >= 0)) && quantityColumn >= 0) { headerRow = index; break; }
  }
  if (headerRow < 0) {
    for (let index = 0; index < rows.length; index++) {
      const found = rows[index].findIndex(value => parseLoopZone(value));
      if (found < 0) continue;
      headerRow = index - 1; combined = found;
      quantityColumn = rows[index].findIndex((value, cellIndex) => cellIndex !== found && /^\d+(?:\.\d+)?$/.test(clean(value)));
      if (quantityColumn < 0) quantityColumn = found + 1;
      break;
    }
  }
  if (combined < 0 && (loopColumn < 0 || zoneColumn < 0)) throw new Error('Could not find a loop/zone column. Use a heading such as Loop/Zone or separate Loop and Zone columns.');
  const result = [];
  for (let index = Math.max(0, headerRow + 1); index < rows.length; index++) {
    const row = rows[index];
    let pair = combined >= 0 ? parseLoopZone(row[combined]) : null;
    if (!pair && loopColumn >= 0 && zoneColumn >= 0) {
      const loop = upper(row[loopColumn]).replace(/\s+/g, '');
      const zone = upper(row[zoneColumn]).replace(/^Z(?:ONE)?\s*/i, '');
      if (/^D\d+[A-Z]?$/.test(loop) && /^\d+[A-Z]?$/.test(zone)) pair = { loop, zone };
    }
    if (!pair) continue;
    const quantity = Number(String(row[quantityColumn] || '1').replace(/,/g, ''));
    if (!Number.isFinite(quantity) || quantity <= 0) continue;
    result.push({ loop: pair.loop, zone: pair.zone, quantity, sourceRow: index + 1 });
  }
  if (!result.length) throw new Error('No valid loop/zone and quantity rows were found.');
  const aggregate = new Map();
  for (const row of result) {
    const key = `${row.loop}|${row.zone}`;
    if (aggregate.has(key)) aggregate.get(key).quantity += row.quantity;
    else aggregate.set(key, { ...row });
  }
  return [...aggregate.values()];
}

function tableName(title) {
  const value = upper(title).replace(/\s+LIGHTING CONTROL PROGRAM.*$/, '').replace(/\s+CONTROL PROGRAM.*$/, '').trim();
  if (value.includes('FOH')) return 'Sales Area';
  if (value.includes('BACKSTAGE')) return 'Backstage';
  if (value.includes('EXPERIENCE')) return 'Experience Room';
  if (value.includes('STANDALONE')) return 'Standalone Rooms';
  return clean(value.replace(/\bPROGRAM\b/g, '')) || 'Detected table';
}

function isFixtureCode(value) {
  return /\bE\.L[EF]\.[A-Z0-9.]+/i.test(clean(value));
}

function fixtureValue(items, startIndex) {
  for (let index = startIndex + 1; index < items.length; index++) {
    const value = clean(items[index].str);
    if (isFixtureCode(value)) return { value, index };
  }
  return null;
}

function visualPdfItems(items, geometry = {}) {
  const height = Number(geometry.height || 0);
  const matrix = Array.isArray(geometry.transform) && geometry.transform.length === 6 ? geometry.transform : null;
  return items.filter(item => clean(item.str)).map((item, index) => {
    const sourceX = Number(item.transform?.[4] ?? item.x ?? 0);
    const sourceY = Number(item.transform?.[5] ?? item.y ?? 0);
    const canvasX = matrix ? matrix[0] * sourceX + matrix[2] * sourceY + matrix[4] : sourceX;
    const canvasY = matrix ? matrix[1] * sourceX + matrix[3] * sourceY + matrix[5] : height ? height - sourceY : -sourceY;
    return {
      index, str: clean(item.str), x: canvasX, y: height ? height - canvasY : sourceY,
      width: Math.max(1, Number(item.width || 0)), height: Math.max(1, Number(item.height || 0)),
    };
  });
}

function textLines(items) {
  const lines = [];
  for (const item of [...items].sort((left, right) => right.y - left.y || left.x - right.x)) {
    const tolerance = Math.max(3, Math.min(7, item.height * .42));
    let line = lines.find(candidate => Math.abs(candidate.y - item.y) <= tolerance);
    if (!line) { line = { y: item.y, items: [] }; lines.push(line); }
    line.items.push(item);
  }
  return lines.map(line => ({ ...line, items: line.items.sort((left, right) => left.x - right.x) })).sort((left, right) => right.y - left.y);
}

function horizontalSegments(items, gap = 320) {
  const segments = [];
  for (const item of [...items].sort((left, right) => left.x - right.x)) {
    const previous = segments.at(-1);
    const previousRight = previous ? Math.max(...previous.items.map(value => value.x + value.width)) : 0;
    if (!previous || item.x - previousRight > gap) segments.push({ items: [item] });
    else previous.items.push(item);
  }
  return segments.map(segment => ({
    ...segment,
    left: Math.min(...segment.items.map(item => item.x)),
    right: Math.max(...segment.items.map(item => item.x + item.width)),
  }));
}

function distanceToInterval(value, left, right) {
  if (value < left) return left - value;
  if (value > right) return value - right;
  return 0;
}

function isPdfTableTitle(value) {
  const text = upper(value);
  if (text.length < 8 || text.length > 100 || /^PROGRAMMING\b/.test(text) || text === 'LIGHTING CONTROL') return false;
  return /\bCONTROL\s+PROGRAM\b/.test(text)
    || /\bTOUCHSCREEN\s+OVERRIDE\s+CONTROLS\b/.test(text)
    || /\bDAILY\s+OPERATIONS\b.*\bINTEGRATION\b/.test(text);
}

function defaultColumnMappings(columns) {
  const mappings = {};
  const used = new Set();
  const match = (role, expressions) => {
    const column = columns.find(candidate => !used.has(candidate.index) && expressions.some(expression => expression.test(upper(candidate.label))));
    if (column) { mappings[column.index] = role; used.add(column.index); }
  };
  match('loop', [/CONTROL.*LOOP/, /\bLOOP#?\b/, /DALI.*LOOP/]);
  match('zone', [/CUSTOMER.*ZONE/, /^ZONE$/]);
  match('location', [/ZONE.*NAME/, /ROOM.*NAME/, /^LOCATION$/]);
  match('fixture', [/OWNER.*PRODUCT.*CODE/, /FIXTURE(?:.*TYPE|.*NAME)?/]);
  match('area', [/^AREA$/, /AREA\s*NAME/]);
  return mappings;
}

export function extractPdfTablesFromItems(items, pageNumber = 1, geometry = {}) {
  const normalized = visualPdfItems(items, geometry);
  const lines = textLines(normalized);
  const titles = normalized.filter(item => isPdfTableTitle(item.str));
  const tables = [];
  for (const title of titles) {
    const titleCenter = title.x + title.width / 2;
    const headerLines = lines.filter(line => line.y < title.y - 2 && line.y >= title.y - 135);
    const headerSegments = headerLines.map(line => {
      const segments = horizontalSegments(line.items);
      return segments.sort((left, right) => distanceToInterval(titleCenter, left.left, left.right) - distanceToInterval(titleCenter, right.left, right.right))[0];
    }).filter(segment => segment && segment.items.length >= 2 && distanceToInterval(titleCenter, segment.left, segment.right) < 180);
    if (!headerSegments.length) continue;
    const widest = headerSegments.sort((left, right) => (right.right - right.left) - (left.right - left.left))[0];
    let left = widest.left - 18;
    let right = widest.right + 18;
    const horizontalNeighbors = titles.filter(candidate => candidate !== title && Math.abs(candidate.y - title.y) < 105);
    const leftNeighbor = horizontalNeighbors.filter(candidate => candidate.x + candidate.width / 2 < titleCenter).sort((a, b) => (b.x + b.width / 2) - (a.x + a.width / 2))[0];
    const rightNeighbor = horizontalNeighbors.filter(candidate => candidate.x + candidate.width / 2 > titleCenter).sort((a, b) => (a.x + a.width / 2) - (b.x + b.width / 2))[0];
    if (leftNeighbor) left = Math.max(left, ((leftNeighbor.x + leftNeighbor.width / 2) + titleCenter) / 2);
    if (rightNeighbor) right = Math.min(right, ((rightNeighbor.x + rightNeighbor.width / 2) + titleCenter) / 2);
    const nextTitle = titles
      .filter(candidate => candidate !== title && candidate.y < title.y - 12 && candidate.y > title.y - 1700)
      .filter(candidate => candidate.x + candidate.width >= left && candidate.x <= right)
      .sort((a, b) => b.y - a.y)[0];
    const minimumY = Math.max(0, nextTitle ? nextTitle.y + 8 : title.y - 1650);
    let bodyLines = lines.filter(line => line.y < title.y - 3 && line.y > minimumY).map(line => ({
      y: line.y,
      items: line.items.filter(item => item.x + item.width >= left && item.x <= right),
    })).filter(line => line.items.length);
    const trimmed = [];
    for (const line of bodyLines) {
      if (trimmed.length && trimmed.at(-1).y - line.y > 95) break;
      trimmed.push(line);
    }
    bodyLines = trimmed;
    if (bodyLines.length < 2) continue;
    const anchorLine = [...bodyLines].sort((a, b) => b.items.length - a.items.length || b.y - a.y)[0];
    if (!anchorLine || anchorLine.items.length < 2) continue;
    const anchors = anchorLine.items.map(item => item.x + item.width / 2).sort((a, b) => a - b);
    const rawRows = bodyLines.map(line => {
      const cells = Array.from({ length: anchors.length }, () => []);
      for (const item of line.items) {
        const center = item.x + item.width / 2;
        let column = 0;
        for (let index = 1; index < anchors.length; index++) if (Math.abs(anchors[index] - center) < Math.abs(anchors[column] - center)) column = index;
        cells[column].push(item.str);
      }
      return { y: line.y, cells: cells.map(values => clean(values.join(' '))) };
    }).filter(row => row.cells.some(Boolean));
    const columns = anchors.map((anchor, index) => {
      const values = rawRows.slice(0, 7).map(row => row.cells[index]).filter(Boolean);
      return { index, anchor, label: clean([...new Set(values)].slice(0, 3).join(' / ')) || `Column ${index + 1}` };
    });
    tables.push({
      id: `${pageNumber}:${Math.round(title.x)}:${Math.round(title.y)}`,
      name: clean(title.str), title: clean(title.str), page: pageNumber, selected: false,
      columns, mappings: defaultColumnMappings(columns), rawRows,
    });
  }
  return tables;
}

export function extractCandidateTablesFromItems(items, pageNumber = 1, geometry = {}) {
  return extractPdfTablesFromItems(items, pageNumber, geometry);
}

function normalizedPdfText(value) {
  return upper(value).replace(/[^A-Z0-9]+/g, ' ').trim();
}

export function hasLightingControlProgrammingTitle(items, pageWidth, pageHeight, viewportTransform = null) {
  const width = Number(pageWidth) || Math.max(1, ...items.map(item => Number(item.transform?.[4] || item.x || 0)));
  const height = Number(pageHeight) || Math.max(1, ...items.map(item => Number(item.transform?.[5] || item.y || 0)));
  const titleBlockItems = visualPdfItems(items, { width, height, transform: viewportTransform })
    .filter(item => item.x >= width * .45 && item.y <= height * .42)
    .sort((left, right) => Math.abs(right.y - left.y) > 3 ? right.y - left.y : left.x - right.x);
  const titleBlockText = normalizedPdfText(titleBlockItems.map(item => item.str).join(' '));
  return /LIGHTING\s+CONTROL\s+PROGRAMM(?:ING)?\b/.test(titleBlockText);
}

export function parsePdfPageSelection(value, totalPages) {
  const source = clean(value).replace(/\b(?:PAGE|PAGES|PG|PGS)\b/gi, '').trim();
  if (!source) throw new Error('Enter at least one PDF page number, such as 17 or 17-19.');
  const selected = new Set();
  for (const token of source.split(/[;,\s]+/).filter(Boolean)) {
    const range = token.match(/^(\d+)\s*[-–—]\s*(\d+)$/);
    if (range) {
      const start = Number(range[1]), end = Number(range[2]);
      if (start > end) throw new Error(`Page range ${token} is reversed.`);
      for (let page = start; page <= end; page++) selected.add(page);
      continue;
    }
    if (!/^\d+$/.test(token)) throw new Error(`“${token}” is not a valid PDF page number.`);
    selected.add(Number(token));
  }
  const pages = [...selected].sort((left, right) => left - right);
  const invalid = pages.filter(page => page < 1 || page > totalPages);
  if (invalid.length) throw new Error(`PDF page ${invalid.join(', ')} is outside this ${totalPages}-page file.`);
  return pages;
}

export async function extractLightingControlPdf(arrayBuffer, options = {}, onProgress = () => {}) {
  const pdfjs = await import(PDF_MODULE_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  const documentValue = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const mode = options.mode === 'manual' ? 'manual' : 'auto';
  const selectedPages = mode === 'manual' ? parsePdfPageSelection(options.pages, documentValue.numPages) : [];
  const pageContent = new Map();
  const tables = [];
  let textItems = 0;
  if (mode === 'auto') {
    for (let pageNumber = 1; pageNumber <= documentValue.numPages; pageNumber++) {
      onProgress({ phase: 'scan', page: pageNumber, total: documentValue.numPages, selectedPages: [...selectedPages] });
      const page = await documentValue.getPage(pageNumber);
      const content = await page.getTextContent();
      const viewport = page.getViewport({ scale: 1 });
      textItems += content.items.length;
      if (hasLightingControlProgrammingTitle(content.items, viewport.width, viewport.height, viewport.transform)) {
        selectedPages.push(pageNumber);
        pageContent.set(pageNumber, content);
      }
    }
    if (textItems < 20) throw new Error('This PDF does not contain a usable text layer. Run OCRmyPDF/Tesseract on the file, then upload the searchable PDF.');
    if (!selectedPages.length) throw new Error('No LIGHTING CONTROL PROGRAMMING sheet was found in the bottom-right title blocks. Choose “Use PDF page number(s)” and provide the page number.');
  }
  textItems = 0;
  for (const [index, pageNumber] of selectedPages.entries()) {
    onProgress({ phase: 'extract', page: pageNumber, total: documentValue.numPages, selectedPages: [...selectedPages], selectedIndex: index + 1 });
    const page = await documentValue.getPage(pageNumber);
    const content = pageContent.get(pageNumber) || await page.getTextContent();
    textItems += content.items.length;
    const viewport = page.getViewport({ scale: 1 });
    tables.push(...extractPdfTablesFromItems(content.items, pageNumber, { width: viewport.width, height: viewport.height, transform: viewport.transform }));
  }
  if (textItems < 20) throw new Error('This PDF does not contain a usable text layer. Run OCRmyPDF/Tesseract on the file, then upload the searchable PDF.');
  if (!tables.length) throw new Error(`No readable tables were detected on PDF page${selectedPages.length === 1 ? '' : 's'} ${selectedPages.join(', ')}. Confirm the page contains selectable text or run OCR on the PDF.`);
  return tables;
}

export async function extractE511Pdf(arrayBuffer, onProgress = () => {}) {
  return extractLightingControlPdf(arrayBuffer, { mode: 'auto' }, progress => onProgress(progress.page, progress.total));
}

function mappedTableRows(table) {
  if (!table?.rawRows?.length) return table?.rows || [];
  const roleColumns = role => table.columns.filter(column => table.mappings?.[column.index] === role).map(column => column.index);
  const loopColumns = roleColumns('loop');
  const zoneColumns = roleColumns('zone');
  if (!loopColumns.length || !zoneColumns.length) return [];
  const cellValue = (row, columns) => clean(columns.map(index => row.cells[index]).filter(Boolean).join(' '));
  const keyed = table.rawRows.map((row, index) => {
    const loop = upper(cellValue(row, loopColumns)).replace(/\s+/g, '');
    const zone = upper(cellValue(row, zoneColumns)).replace(/^Z(?:ONE)?\s*/i, '');
    return /^D\d+[A-Z]?$/.test(loop) && /^\d+[A-Z]?$/.test(zone) ? { row, index, loop, zone } : null;
  }).filter(Boolean);
  return keyed.map((key, keyIndex) => {
    const previous = keyed[keyIndex - 1];
    const next = keyed[keyIndex + 1];
    const distances = [previous && Math.abs(previous.row.y - key.row.y), next && Math.abs(next.row.y - key.row.y)].filter(Boolean);
    const radius = Math.min(32, Math.max(7, (Math.min(...distances, 64) / 2) - .1));
    const nearbyRows = table.rawRows.filter(row => Math.abs(row.y - key.row.y) <= radius).sort((a, b) => b.y - a.y);
    const valueFor = role => {
      const columns = roleColumns(role);
      const values = nearbyRows.flatMap(row => columns.map(index => clean(row.cells[index]))).filter(Boolean);
      return clean([...new Set(values)].join(' '));
    };
    return {
      loop: key.loop, zone: key.zone, area: valueFor('area') || tableName(table.title),
      location: valueFor('location'), fixture: valueFor('fixture'), page: table.page,
      tableId: table.id, tableName: table.name, title: table.title,
    };
  });
}

function naturalParts(value) {
  return upper(value).match(/\d+|\D+/g)?.map(part => /^\d+$/.test(part) ? Number(part) : part) || [];
}
function naturalCompare(left, right) {
  const a = naturalParts(left), b = naturalParts(right);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    if (a[index] === undefined) return -1;
    if (b[index] === undefined) return 1;
    if (a[index] === b[index]) continue;
    return a[index] < b[index] ? -1 : 1;
  }
  return 0;
}

export function joinSchedule(bluebeamRows, tables) {
  const sourceRows = tables.filter(table => table.selected !== false).flatMap(mappedTableRows);
  const exact = new Map();
  for (const row of sourceRows) {
    const key = `${upper(row.loop)}|${upper(row.zone).replace(/^Z/, '')}`;
    if (!exact.has(key)) exact.set(key, []);
    exact.get(key).push(row);
  }
  return bluebeamRows.map((input, index) => {
    const key = `${upper(input.loop)}|${upper(input.zone).replace(/^Z/, '')}`;
    const matches = exact.get(key) || [];
    const first = matches[0];
    return {
      id: `dali-${Date.now()}-${index}`, include: true, loop: input.loop, zone: input.zone,
      area: first?.area || '', location: first?.location || '', fixture: first?.fixture || '',
      quantity: input.quantity, driversPerAddress: 1,
      notes: matches.length > 1 ? `${matches.length} LIGHTING CONTROL PROGRAMMING matches; verify selected information` : '',
      status: matches.length === 1 ? 'matched' : matches.length > 1 ? 'ambiguous' : 'unmatched', matchCount: matches.length,
    };
  }).sort((left, right) => naturalCompare(left.loop, right.loop) || naturalCompare(left.zone, right.zone));
}

function inlineCell(reference, value, style = 7) {
  return `<c r="${reference}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
function numberCell(reference, value, style = 8) {
  return `<c r="${reference}" s="${style}"><v>${Number(value) || 0}</v></c>`;
}
function formulaCell(reference, formula, style = 5, cached = 0) {
  return `<c r="${reference}" s="${style}"><f>${xml(formula)}</f><v>${Number(cached) || 0}</v></c>`;
}
function textFormulaCell(reference, formula, style = 5, cached = '') {
  return `<c r="${reference}" t="str" s="${style}"><f>${xml(formula)}</f><v>${xml(cached)}</v></c>`;
}

function normalizedDriversPerAddress(row) {
  const value = Number(row?.driversPerAddress || 1);
  return Number.isInteger(value) && value >= 2 && value <= 6 ? value : 1;
}

function scheduleNotes(row) {
  const notes = clean(row?.notes).replace(/(?:^|;\s*)[2-6] drivers per address(?:;\s*|$)/gi, '; ').replace(/^;\s*|;\s*$/g, '');
  const drivers = normalizedDriversPerAddress(row);
  return [notes, drivers > 1 ? `${drivers} drivers per address` : ''].filter(Boolean).join('; ');
}

function worksheetXml(rows, metadata, firstLoopIndex) {
  const rowXml = [];
  const merges = [];
  rowXml.push(`<row r="1" ht="29" customHeight="1">${inlineCell('A1', 'DALI Load Schedule', 1)}</row>`);
  merges.push('A1:H1');
  const fields = [['Project', metadata.project], ['Created by', metadata.creator], ['Date', metadata.date], ['Revision', metadata.revision], ['Panel ID', metadata.panel]];
  const metaCells = fields.map((field, index) => inlineCell(`${String.fromCharCode(65 + index)}3`, field[0], 2)).join('');
  rowXml.push(`<row r="3">${metaCells}</row>`);
  rowXml.push(`<row r="4">${fields.map((field, index) => inlineCell(`${String.fromCharCode(65 + index)}4`, field[1] || '', 0)).join('')}</row>`);
  let currentRow = 6;
  for (const [loopIndex, group] of rows.entries()) {
    const loop = group.loop;
    rowXml.push(`<row r="${currentRow}" ht="24" customHeight="1">${inlineCell(`A${currentRow}`, `DALI LOOP ${loop} · DEVICE ${firstLoopIndex + loopIndex + 1}`, 4)}</row>`);
    merges.push(`A${currentRow}:H${currentRow}`);
    currentRow++;
    const headers = ['Loop', 'Zone', 'Group', 'Area', 'Location', 'Fixture', 'Quantity', 'Notes'];
    rowXml.push(`<row r="${currentRow}" ht="28" customHeight="1">${headers.map((header, index) => inlineCell(`${String.fromCharCode(65 + index)}${currentRow}`, header, 3)).join('')}</row>`);
    currentRow++;
    const dataStart = currentRow;
    for (const [groupIndex, item] of group.rows.entries()) {
      rowXml.push(`<row r="${currentRow}" ht="25" customHeight="1">${inlineCell(`A${currentRow}`, item.loop)}${inlineCell(`B${currentRow}`, `Z${item.zone}`)}${numberCell(`C${currentRow}`, groupIndex + 1)}${inlineCell(`D${currentRow}`, item.area)}${inlineCell(`E${currentRow}`, item.location)}${inlineCell(`F${currentRow}`, item.fixture)}${numberCell(`G${currentRow}`, item.quantity)}${inlineCell(`H${currentRow}`, scheduleNotes(item))}</row>`);
      currentRow++;
    }
    const loopTotal = group.rows.reduce((sum, item) => sum + Number(item.quantity || 0), 0);
    const addressTerms = group.rows.map((item, index) => `ROUNDUP(G${dataStart + index}/${normalizedDriversPerAddress(item)},0)`);
    const addressTotal = group.rows.reduce((sum, item) => sum + Math.ceil(Number(item.quantity || 0) / normalizedDriversPerAddress(item)), 0);
    const openAddresses = 64 - addressTotal;
    const unusedGroups = Math.max(0, 16 - group.rows.length);
    const totalStyle = addressTotal > 64 || group.rows.length > 16 ? 6 : 5;
    const openAddressFormula = `IF(64-SUM(${addressTerms.join(',')})>=0,64-SUM(${addressTerms.join(',')})&" open addresses",ABS(64-SUM(${addressTerms.join(',')}))&" addresses over limit")`;
    const openAddressLabel = openAddresses >= 0 ? `${openAddresses} open addresses` : `${Math.abs(openAddresses)} addresses over limit`;
    rowXml.push(`<row r="${currentRow}" ht="28" customHeight="1">${inlineCell(`A${currentRow}`, `${loop} Loop Total`, totalStyle)}${inlineCell(`B${currentRow}`, '', totalStyle)}${inlineCell(`C${currentRow}`, `${unusedGroups} unused groups`, totalStyle)}${inlineCell(`D${currentRow}`, '', totalStyle)}${inlineCell(`E${currentRow}`, '', totalStyle)}${inlineCell(`F${currentRow}`, 'DALI address count (64 max)', totalStyle)}${formulaCell(`G${currentRow}`, `SUM(G${dataStart}:G${currentRow - 1})`, totalStyle, loopTotal)}${textFormulaCell(`H${currentRow}`, openAddressFormula, totalStyle, openAddressLabel)}</row>`);
    currentRow += 2;
  }
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><tabColor rgb="FF007EA8"/></sheetPr><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="15"/><cols><col min="1" max="1" width="20" customWidth="1"/><col min="2" max="2" width="15" customWidth="1"/><col min="3" max="3" width="19" customWidth="1"/><col min="4" max="4" width="22" customWidth="1"/><col min="5" max="5" width="29" customWidth="1"/><col min="6" max="6" width="27" customWidth="1"/><col min="7" max="7" width="13" customWidth="1"/><col min="8" max="8" width="32" customWidth="1"/></cols><sheetData>${rowXml.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(range => `<mergeCell ref="${range}"/>`).join('')}</mergeCells><pageMargins left="0.25" right="0.25" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0" paperSize="9"/></worksheet>`;
}

export async function buildScheduleWorkbook(scheduleRows, metadata, ZipCtor = globalThis.JSZip) {
  if (!ZipCtor) throw new Error('The Excel exporter is unavailable.');
  const included = scheduleRows.filter(row => row.include !== false);
  if (!included.length) throw new Error('Select at least one schedule row to export.');
  const loops = [...new Set(included.map(row => upper(row.loop)))].sort(naturalCompare);
  const oversizedLoop = loops.find(loop => included.filter(row => upper(row.loop) === loop).length > 16);
  if (oversizedLoop) throw new Error(`${oversizedLoop} has more than 16 schedule rows. Remove or combine rows before exporting.`);
  const sheets = [];
  for (let start = 0; start < loops.length; start += 6) {
    const groupLoops = loops.slice(start, start + 6);
    sheets.push({ name: `Loop ${start + 1}-${start + groupLoops.length}`, loops: groupLoops.map(loop => ({ loop, rows: included.filter(row => upper(row.loop) === loop) })) });
  }
  const zip = new ZipCtor();
  zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`);
  zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((sheet, index) => `<sheet name="${xml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join('')}</sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`);
  zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`);
  zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="5"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="20"/><color rgb="FF004B76"/><name val="Arial"/></font><font><b/><sz val="9"/><color rgb="FF3D6273"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FF003B5C"/><name val="Arial"/></font></fonts><fills count="6"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF007EA8"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF004B76"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFD8EFF7"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFC7CE"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFA7C7D4"/></left><right style="thin"><color rgb="FFA7C7D4"/></right><top style="thin"><color rgb="FFA7C7D4"/></top><bottom style="thin"><color rgb="FFA7C7D4"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="9"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf><xf numFmtId="0" fontId="4" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="4" fillId="5" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`);
  sheets.forEach((sheet, index) => zip.file(`xl/worksheets/sheet${index + 1}.xml`, worksheetXml(sheet.loops, metadata, index * 6)));
  const now = new Date().toISOString();
  zip.file('docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(metadata.project || 'DALI Schedule')}</dc:title><dc:creator>${xml(metadata.creator || 'Project Tools')}</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">${now}</dcterms:modified></cp:coreProperties>`);
  zip.file('docProps/app.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Project Tools</Application><Company></Company><AppVersion>1.2</AppVersion></Properties>`);
  return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

async function bluebeamFileRows(file) {
  if (/\.csv$/i.test(file.name) || /text\/(csv|plain)/i.test(file.type)) return parseCsv(await file.text());
  if (/\.(xlsx|xlsm)$/i.test(file.name)) return workbookRows(file);
  throw new Error('Use a CSV, XLSX, or XLSM Bluebeam export.');
}

function escapeHtml(value) {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

function downloadBlob(blob, fileName) {
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob); link.download = fileName;
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(link.href), 30000);
}

function safeName(value) {
  return clean(value || 'Apple DALI Schedule').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/\s+/g, ' ').slice(0, 120);
}

function init() {
  const root = document.getElementById('dali-view');
  if (!root) return;
  const byId = id => document.getElementById(id);
  const elements = {
    bluebeam: byId('dali-bluebeam-file'), pdf: byId('dali-lighting-control-file'), bluebeamStatus: byId('dali-bluebeam-status'), pdfStatus: byId('dali-pdf-status'),
    pageMode: byId('dali-page-mode'), pageInputWrap: byId('dali-page-input-wrap'), pageInput: byId('dali-page-input'), processPdf: byId('dali-process-pdf'),
    tablePanel: byId('dali-table-panel'), tableList: byId('dali-table-list'), selectAll: byId('dali-select-all'), clearAll: byId('dali-clear-all'),
    combine: byId('dali-combine'), reviewPanel: byId('dali-review-panel'), reviewBody: byId('dali-review-body'), summary: byId('dali-review-summary'),
    exportButton: byId('dali-export'), project: byId('dali-project'), creator: byId('dali-creator'), revision: byId('dali-revision'), panel: byId('dali-panel'),
  };
  const state = { bluebeam: [], tables: [], schedule: [] };

  function syncPageMode() {
    const manual = elements.pageMode.value === 'manual';
    elements.pageInputWrap.hidden = !manual;
    elements.pageInput.disabled = !manual;
  }

  async function processPdf() {
    const file = elements.pdf.files?.[0];
    if (!file) {
      elements.pdfStatus.dataset.state = 'error'; elements.pdfStatus.textContent = 'Choose a PDF first.';
      return;
    }
    const manual = elements.pageMode.value === 'manual';
    if (manual && !clean(elements.pageInput.value)) {
      elements.pdfStatus.dataset.state = 'error'; elements.pdfStatus.textContent = 'Enter one or more PDF page numbers, then choose Read PDF.';
      return;
    }
    elements.processPdf.disabled = true;
    elements.pageMode.disabled = true;
    elements.pageInput.disabled = true;
    elements.pdfStatus.dataset.state = 'loading';
    elements.pdfStatus.textContent = manual ? 'Reading selected PDF page(s)…' : 'Searching bottom-right title blocks…';
    state.tables = [];
    state.schedule = [];
    renderTables();
    renderReview();
    try {
      state.tables = await extractLightingControlPdf(await file.arrayBuffer(), { mode: manual ? 'manual' : 'auto', pages: elements.pageInput.value }, progress => {
        elements.pdfStatus.textContent = progress.phase === 'scan'
          ? `Searching title blocks — page ${progress.page} of ${progress.total}…`
          : `Converting PDF page ${progress.page} (${progress.selectedIndex} of ${progress.selectedPages.length})…`;
      });
      const detectedPages = [...new Set(state.tables.map(table => table.page))].sort((left, right) => left - right);
      elements.pdfStatus.dataset.state = 'ready';
      elements.pdfStatus.textContent = `${state.tables.length} candidate table${state.tables.length === 1 ? '' : 's'} detected on PDF page${detectedPages.length === 1 ? '' : 's'} ${detectedPages.join(', ')} — review below`;
    } catch (error) {
      state.tables = []; elements.pdfStatus.dataset.state = 'error'; elements.pdfStatus.textContent = error.message;
    } finally {
      elements.processPdf.disabled = false;
      elements.pageMode.disabled = false;
      syncPageMode();
      renderTables();
    }
  }

  const mappingOptions = [
    ['', 'Ignore'], ['loop', 'Loop'], ['zone', 'Zone'], ['area', 'Area'], ['location', 'Location'], ['fixture', 'Fixture name'],
  ];
  function tableHasRequiredMappings(table) {
    const roles = new Set(Object.values(table.mappings || {}));
    return roles.has('loop') && roles.has('zone');
  }
  function updateCombine() { elements.combine.disabled = !state.bluebeam.length || !state.tables.some(table => table.selected && tableHasRequiredMappings(table)); }
  function renderTables() {
    elements.tablePanel.hidden = !state.tables.length;
    elements.tableList.innerHTML = state.tables.map(table => {
      const mappedCount = mappedTableRows(table).length;
      const ready = tableHasRequiredMappings(table);
      const columnHeadings = table.columns.map(column => `<th><label><span>Column ${column.index + 1}</span><select data-map-table="${escapeHtml(table.id)}" data-map-column="${column.index}" aria-label="Map column ${column.index + 1}">${mappingOptions.map(([value, label]) => `<option value="${value}" ${table.mappings?.[column.index] === value ? 'selected' : ''}>${label}</option>`).join('')}</select><small title="${escapeHtml(column.label)}">${escapeHtml(column.label)}</small></label></th>`).join('');
      const previewRows = table.rawRows.slice(0, 14).map(row => `<tr>${row.cells.map(cell => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('');
      return `<article class="dali-map-card${table.selected ? ' selected' : ''}"><div class="dali-map-card-head"><label class="dali-map-choice"><input type="checkbox" data-table-id="${escapeHtml(table.id)}" ${table.selected ? 'checked' : ''}><span><strong>${escapeHtml(table.name)}</strong><small>PDF page ${table.page} · ${table.columns.length} columns · ${table.rawRows.length} converted lines</small></span></label><span class="dali-map-state ${ready ? 'ready' : 'needs-map'}">${ready ? `${mappedCount} usable row${mappedCount === 1 ? '' : 's'}` : 'Map Loop and Zone'}</span></div><div class="dali-source-table-wrap"><table class="dali-source-table"><thead><tr>${columnHeadings}</tr></thead><tbody>${previewRows}</tbody></table></div>${table.rawRows.length > 14 ? `<p class="dali-preview-note">Showing the first 14 of ${table.rawRows.length} converted lines.</p>` : ''}</article>`;
    }).join('');
    elements.tableList.querySelectorAll('[data-table-id]').forEach(input => input.addEventListener('change', () => {
      const table = state.tables.find(item => item.id === input.dataset.tableId); if (table) table.selected = input.checked; updateCombine();
      renderTables();
    }));
    elements.tableList.querySelectorAll('[data-map-table]').forEach(select => select.addEventListener('change', () => {
      const table = state.tables.find(item => item.id === select.dataset.mapTable);
      if (!table) return;
      const column = Number(select.dataset.mapColumn);
      if (select.value) table.mappings[column] = select.value;
      else delete table.mappings[column];
      renderTables();
    }));
    updateCombine();
  }
  function renderReview() {
    const matched = state.schedule.filter(row => row.status === 'matched').length;
    const review = state.schedule.length - matched;
    elements.reviewPanel.hidden = !state.schedule.length;
    elements.summary.innerHTML = `<strong>${matched} matched</strong><span>${review} need${review === 1 ? 's' : ''} review</span><span>${state.schedule.reduce((sum, row) => sum + Number(row.quantity || 0), 0)} total fixtures</span>`;
    elements.reviewBody.innerHTML = state.schedule.map(row => {
      const drivers = normalizedDriversPerAddress(row);
      return `<tr data-row-id="${row.id}" data-status="${row.status}"><td><input type="checkbox" data-field="include" ${row.include ? 'checked' : ''} aria-label="Include row"></td><td><input data-field="loop" value="${escapeHtml(row.loop)}"></td><td><input data-field="zone" value="${escapeHtml(row.zone)}"></td><td><input data-field="area" value="${escapeHtml(row.area)}"></td><td><input data-field="location" value="${escapeHtml(row.location)}"></td><td><input data-field="fixture" value="${escapeHtml(row.fixture)}"></td><td><div class="dali-quantity-control"><input type="number" min="0" step="1" data-field="quantity" value="${escapeHtml(row.quantity)}"><button class="dali-driver-button${drivers > 1 ? ' active' : ''}" type="button" aria-label="Set drivers per address" aria-expanded="false" title="${drivers > 1 ? `${drivers} drivers per address` : 'Set multiple drivers per address'}">${drivers > 1 ? `★${drivers}` : '☆'}</button><select class="dali-driver-select" data-field="driversPerAddress" aria-label="Drivers per address" hidden><option value="1">One per address</option>${[2, 3, 4, 5, 6].map(value => `<option value="${value}" ${drivers === value ? 'selected' : ''}>${value} drivers</option>`).join('')}</select></div></td><td><span class="dali-match ${row.status}">${row.status === 'matched' ? 'Matched' : row.status === 'ambiguous' ? 'Verify match' : 'Not found'}</span></td><td><button class="dali-delete-row" type="button" aria-label="Delete schedule row">×</button></td></tr>`;
    }).join('');
    elements.reviewBody.querySelectorAll('tr').forEach(rowElement => {
      const row = state.schedule.find(item => item.id === rowElement.dataset.rowId);
      rowElement.querySelectorAll('[data-field]').forEach(input => input.addEventListener('change', () => {
        const field = input.dataset.field;
        row[field] = field === 'include' ? input.checked : field === 'quantity' || field === 'driversPerAddress' ? Number(input.value) : clean(input.value);
        if (field === 'driversPerAddress') renderReview();
      }));
      const driverButton = rowElement.querySelector('.dali-driver-button');
      const driverSelect = rowElement.querySelector('.dali-driver-select');
      driverButton.addEventListener('click', () => {
        driverSelect.hidden = !driverSelect.hidden;
        driverButton.setAttribute('aria-expanded', String(!driverSelect.hidden));
        if (!driverSelect.hidden) driverSelect.focus();
      });
      rowElement.querySelector('.dali-delete-row').addEventListener('click', () => { state.schedule = state.schedule.filter(item => item.id !== row.id); renderReview(); });
    });
  }

  elements.bluebeam.addEventListener('change', async () => {
    const file = elements.bluebeam.files?.[0]; if (!file) return;
    elements.bluebeamStatus.dataset.state = 'loading'; elements.bluebeamStatus.textContent = 'Reading ' + file.name + '…';
    try {
      state.bluebeam = parseBluebeamRows(await bluebeamFileRows(file));
      elements.bluebeamStatus.dataset.state = 'ready'; elements.bluebeamStatus.textContent = `${state.bluebeam.length} unique loop/zone row${state.bluebeam.length === 1 ? '' : 's'} loaded`;
    } catch (error) { state.bluebeam = []; elements.bluebeamStatus.dataset.state = 'error'; elements.bluebeamStatus.textContent = error.message; }
    updateCombine();
  });
  elements.pageMode.addEventListener('change', () => {
    syncPageMode();
    state.tables = [];
    state.schedule = [];
    renderTables();
    renderReview();
    elements.pdfStatus.dataset.state = '';
    elements.pdfStatus.textContent = elements.pdf.files?.[0]
      ? elements.pageMode.value === 'manual' ? 'Enter PDF page number(s), then choose Read PDF.' : 'Choose Read PDF to find every LIGHTING CONTROL PROGRAMMING sheet.'
      : 'No file selected';
  });
  elements.pageInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); processPdf(); } });
  elements.processPdf.addEventListener('click', processPdf);
  elements.pdf.addEventListener('change', () => {
    if (!elements.pdf.files?.[0]) return;
    if (elements.pageMode.value === 'manual' && !clean(elements.pageInput.value)) {
      elements.pdfStatus.dataset.state = '';
      elements.pdfStatus.textContent = 'Enter one or more PDF page numbers, then choose Read PDF.';
      return;
    }
    processPdf();
  });
  elements.selectAll.addEventListener('click', () => { state.tables.forEach(table => { table.selected = true; }); renderTables(); });
  elements.clearAll.addEventListener('click', () => { state.tables.forEach(table => { table.selected = false; }); renderTables(); });
  elements.combine.addEventListener('click', () => { state.schedule = joinSchedule(state.bluebeam, state.tables); renderReview(); elements.reviewPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }); });
  elements.exportButton.addEventListener('click', async () => {
    elements.exportButton.disabled = true; elements.exportButton.textContent = 'Building Excel schedule…';
    try {
      const metadata = { project: clean(elements.project.value), creator: clean(elements.creator.value), revision: clean(elements.revision.value), panel: clean(elements.panel.value), date: new Intl.DateTimeFormat(undefined, { year: 'numeric', month: 'short', day: 'numeric' }).format(new Date()) };
      const blob = await buildScheduleWorkbook(state.schedule, metadata);
      downloadBlob(blob, `${safeName(metadata.project)}_DALI_Schedule.xlsx`);
    } catch (error) { window.alert(error.message || 'The schedule could not be exported.'); }
    finally { elements.exportButton.disabled = false; elements.exportButton.textContent = 'Export Excel schedule'; }
  });

  function serializeWorkspace() {
    return {
      bluebeam: state.bluebeam,
      tables: state.tables,
      schedule: state.schedule,
      pageMode: elements.pageMode.value,
      pageInput: elements.pageInput.value,
      metadata: { project: elements.project.value, creator: elements.creator.value, revision: elements.revision.value, panel: elements.panel.value },
    };
  }
  function deserializeWorkspace(payload) {
    if (!payload || !Array.isArray(payload.bluebeam) || !Array.isArray(payload.tables) || !Array.isArray(payload.schedule)) throw new Error('This Apple DALI work file is invalid.');
    state.bluebeam = payload.bluebeam.slice(0, 10000);
    state.tables = payload.tables.slice(0, 500);
    state.schedule = payload.schedule.slice(0, 10000);
    elements.pageMode.value = payload.pageMode === 'manual' ? 'manual' : 'auto';
    elements.pageInput.value = clean(payload.pageInput);
    const metadata = payload.metadata || {};
    elements.project.value = clean(metadata.project); elements.creator.value = clean(metadata.creator); elements.revision.value = clean(metadata.revision); elements.panel.value = clean(metadata.panel);
    syncPageMode(); renderTables(); renderReview(); updateCombine();
    elements.bluebeamStatus.dataset.state = state.bluebeam.length ? 'ready' : '';
    elements.bluebeamStatus.textContent = state.bluebeam.length ? `${state.bluebeam.length} saved loop/zone row${state.bluebeam.length === 1 ? '' : 's'} loaded` : 'No saved Bluebeam rows';
    elements.pdfStatus.dataset.state = state.tables.length ? 'ready' : '';
    elements.pdfStatus.textContent = state.tables.length ? `${state.tables.length} saved converted table${state.tables.length === 1 ? '' : 's'} loaded` : 'No saved converted tables';
    return state.schedule.length;
  }
  globalThis.ProjectToolsDaliWorkspace = Object.freeze({ serialize: serializeWorkspace, deserialize: deserializeWorkspace });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();
}

globalThis.ProjectToolsDali = Object.freeze({ parseLoopZone, parseCsv, parseBluebeamRows, parsePdfPageSelection, hasLightingControlProgrammingTitle, extractPdfTablesFromItems, extractCandidateTablesFromItems, extractLightingControlPdf, joinSchedule, buildScheduleWorkbook });
