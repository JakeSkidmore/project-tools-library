const clean = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const escapeHtml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const xml = value => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const safeName = value => clean(value || 'Apple BOM').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').slice(0, 100);
const pdfText = value => clean(value).normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, '-').replace(/[^\x20-\x7e]/g, '');
const PRESET_KEY = 'project-tools-apple-bom-presets-v1';
const DRAFT_KEY = 'project-tools-apple-bom-draft-v1';
const PDF_MODULE_URL = new URL('./pdf.min.mjs', import.meta.url).href;
const PDF_WORKER_URL = new URL('./pdf.worker.compat.mjs', import.meta.url).href;

const defaultSections = [
  { id: 'cpp-panel', group: 'CPP-1', label: 'Panel', note: 'One panel row is included by default.' },
  { id: 'cpp-modules', group: 'CPP-1', label: 'Modules' },
  { id: 'rp-panel', group: 'RP-1', label: 'Panel', note: 'One panel row is included by default.' },
  { id: 'rp-relay', group: 'RP-1', label: 'Relay Modules' },
  { id: 'device-networked', group: 'Devices', label: 'Networked Devices' },
  { id: 'device-standalone', group: 'Devices', label: 'Standalone Devices' },
  { id: 'device-misc', group: 'Devices', label: 'Misc.' },
];

const item = (section, sku, description) => ({ id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`, section, sku, description, quantity: 0 });
const sectionId = () => `section-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
function cloneSections(value = defaultSections) {
  return value.map(section => ({ id: clean(section.id) || sectionId(), group: clean(section.group) || 'Custom', label: clean(section.label) || 'New Section', note: clean(section.note) }));
}
const builtIns = {
  legacy: {
    name: 'Legacy', rows: [
      item('cpp-panel', 'GLEX-FT-84-HC', 'GL,ENC,FEED THRU,84 RELAYS MAX, HINGED COVER'),
      item('cpp-modules', 'DIN-AP4', 'DIN Rail 4-Series Processor'), item('cpp-modules', 'DIN-PWS60', 'DIN Rail 60 Watt Cresnet Power Supply'),
      item('cpp-modules', 'DIN-HUB', 'DIN Rail Cresnet Distribution Hub'), item('cpp-modules', 'DIN-DLI', 'DIN Rail 1 Channel Dali Module'),
      item('cpp-modules', 'CEN-SWPOE-5AC', '5 Port POE Switch'), item('cpp-modules', 'DIN-DMX-2UNIVERSE', 'DIN, CONTROLLER, DMX, 2 UNIVERSE'),
      item('cpp-modules', 'DIN-GWDL-SPLTR', '4 CHANNEL DMX SPLITTER'),
      item('rp-panel', 'GLEX-FT-56-HC', 'GL FEED THRU ENCLOSURE'), item('rp-relay', 'GLXX-CTRL', 'CRESNET CONTROL MODULE'),
      item('rp-relay', 'GLXX-HDSW16', '16 CHANNEL HEAVY DUTY SWITCH MODULE'), item('rp-relay', 'GLR-HD-1P', 'Heavy Duty Single Pole Relay'),
      item('device-networked', 'CM2-KPCN', 'CAMEO2 KEYPAD'), item('device-networked', 'GLS-ODT-C-CN', 'Dual-Technology Occupancy Sensor with Cresnet, 2000 Sq. Ft.'),
      item('device-networked', 'TSW-770-B-S', '7-inch Touch Screen - Black'), item('device-misc', 'FP-G1-W', 'Faceplate, white smooth'),
    ],
  },
  zum: {
    name: 'ZUM BOM', rows: [
      item('cpp-panel', 'DIN-EN-10X18M', 'Enclosure for DIN Rail Devices, 10 DIN Rails, 18 Units Wide'),
      item('cpp-modules', 'ZUM-HUB4', 'Series 4 Processor'), item('cpp-modules', 'DIN-PWS60', 'DIN Rail 60 Watt Cresnet Power Supply'),
      item('cpp-modules', 'ZUMNET-DIN-DLI', 'DIN Zūm Net DALI Module'), item('cpp-modules', 'ZUMLINK-DIN-IO', 'DIN Zūm Link IO'),
      item('cpp-modules', 'ZUMLINK-DIN-PSU', 'DIN Zūm Link Power Supply'), item('cpp-modules', 'CEN-SWPOE-5AC', '5-Port PoE Network Switch'),
      item('cpp-modules', 'DIN-DMX-2UNIVERSE', 'DIN, Controller, DMX, 2 Universe'), item('cpp-modules', 'GLA-ISP-4R-TERM', '4-Channel DMX Splitter with Terminal Inputs'),
      item('rp-panel', 'DIN-EN-6X18M', 'Enclosure for DIN Rail Devices, 6 DIN Rails, 18 Units Wide'),
      item('rp-relay', 'ZUMNET-DIN-16A-LV', 'DIN Zūm Net 0-10V'), item('rp-relay', 'ZUMLINK-DIN-PSU', 'DIN Zūm Link Power Supply'),
      item('rp-relay', 'ZUMLINK-DIN-20A-PLUG', 'DIN Zūm Link Plug Load'),
      item('device-networked', 'ZUMLINK-KP-R-W', 'Zūm Wired Keypad with Link Communication, Rocker Button'),
      item('device-networked', 'ZUMLINK-BTN2-W', 'Two Button Tree and Bezel for Zūm Light Control Keypads'),
      item('device-networked', 'ZUMLINK-DT-QUATTRO-DLS', 'Zūm Wired Dual-Tech Presence Detector with Daylight Sensing and Link Communication'),
      item('device-networked', 'GLA-DT-WLS-1', 'Dual Technology Wall Switch Occupancy Sensor, White'), item('device-networked', 'TSW-770-B-S', '7-inch Touch Screen, Black Smooth'),
      item('device-misc', 'FP-G1-W', 'Faceplate, white smooth'), item('device-misc', 'GLS-PLS-120/277', 'Power Loss Sensor, 3-Phase, 120 or 277 Volts'),
      item('device-misc', 'SW-HUB4-PROG', 'HUB4 Firmware Upgrade - Enabling Custom Programming Port'),
    ],
  },
};

function cloneRows(rows, resetQuantity = false) {
  return rows.map(row => item(row.section, clean(row.sku), clean(row.description))).map((row, index) => ({ ...row, quantity: resetQuantity ? 0 : Math.max(0, Number(rows[index].quantity) || 0) }));
}
function loadCustomPresets() { try { const value = JSON.parse(localStorage.getItem(PRESET_KEY) || '{}'); return value && typeof value === 'object' ? value : {}; } catch { return {}; } }
function saveCustomPresets(value) { localStorage.setItem(PRESET_KEY, JSON.stringify(value)); }
function parseCatalogs() { try { return JSON.parse(document.getElementById('budget-catalog')?.textContent || '{}').priceLists || []; } catch { return []; } }
function bytesToBase64(bytes) { let result = ''; for (let index = 0; index < bytes.length; index += 0x8000) result += String.fromCharCode(...bytes.subarray(index, index + 0x8000)); return btoa(result); }
function download(blob, name) { const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(link.href), 30000); }
function csvValue(value) { const text = String(value ?? ''); return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; }

function groupQuoteLines(items) {
  const positioned = (items || []).map(value => ({
    text: clean(value.str),
    x: Number(value.transform?.[4] ?? value.x ?? 0),
    y: Number(value.transform?.[5] ?? value.y ?? 0),
    height: Number(value.height || 0),
  })).filter(value => value.text).sort((left, right) => right.y - left.y || left.x - right.x);
  const lines = [];
  for (const value of positioned) {
    let line = lines.find(candidate => Math.abs(candidate.y - value.y) <= 2.3);
    if (!line) { line = { y: value.y, items: [] }; lines.push(line); }
    line.items.push(value);
  }
  return lines.sort((left, right) => right.y - left.y).map(line => {
    line.items.sort((left, right) => left.x - right.x);
    return { ...line, text: clean(line.items.map(value => value.text).join(' ')) };
  });
}

function quoteColumn(line, minimum, maximum) {
  return clean(line.items.filter(value => value.x >= minimum && value.x < maximum).map(value => value.text).join(' '));
}

function titleCaseProject(value) {
  const small = new Set(['at', 'and', 'of', 'the', 'in', 'on']);
  return clean(value).toLowerCase().split(' ').map((word, index) => index && small.has(word) ? word : word.replace(/(^|[-/])([a-z])/g, (_match, prefix, letter) => `${prefix}${letter.toUpperCase()}`)).join(' ');
}

function normalizeQuoteSku(value) {
  const sku = clean(value).toUpperCase().replace(/\s+ENGRAVED\b.*$/, '');
  if (sku === 'GLA-ISP-4R-DC-TERM') return 'GLA-ISP-4R-TERM';
  if (sku === 'FP-G1-W-S') return 'FP-G1-W';
  return sku;
}

const quoteReplacementDescriptions = {
  'GLEX-FT-56-HC': 'GL FEED THRU ENCLOSURE',
  'GLXX-CTRL': 'CRESNET CONTROL MODULE',
  'GLXX-HDSW16': '16 CHANNEL HEAVY DUTY SWITCH MODULE',
};

function quoteSection(room, sku) {
  const location = clean(room).toUpperCase();
  if (/^(?:CCP|CPP)-?\d+\b/.test(location)) return sku.startsWith('GLEX-FT-') ? 'cpp-panel' : 'cpp-modules';
  if (/^RP-?\d+\b/.test(location)) return sku.startsWith('GLEX-FT-') ? 'rp-panel' : 'rp-relay';
  if (location.includes('INTERFACE')) return 'device-networked';
  if (location.includes('LINE VOLTAGE')) return 'device-standalone';
  if (location.includes('MISC')) return 'device-misc';
  return '';
}

const quoteSortOrder = new Map([
  'GLEX-FT-84-HC', 'DIN-AP4', 'DIN-PWS60', 'DIN-HUB', 'DIN-DLI', 'CEN-SWPOE-5AC', 'DIN-DMX-2UNIVERSE', 'GLA-ISP-4R-TERM',
  'GLEX-FT-56-HC', 'GLXX-CTRL', 'GLXX-HDSW16', 'GLR-HD-1P',
  'CM2-KPCN', 'GLS-ODT-C-CN', 'TSW-770-B-S', 'GLA-DT-WLS-1-W',
  'CM2-FP-G1-W-S', 'FP-G1-W', 'GLS-PLS-120/277', 'SW-3SERIES-BACNET-50+',
].map((sku, index) => [sku, index]));

function dateToInput(value) {
  const match = clean(value).match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  return match ? `${match[3]}-${match[1].padStart(2, '0')}-${match[2].padStart(2, '0')}` : clean(value);
}

function parseCdtlQuotePages(pages) {
  const pageLines = (pages || []).map(page => ({ pageNumber: page.pageNumber, lines: groupQuoteLines(page.items), items: page.items || [] }));
  const rawRows = [];
  for (const page of pageLines) {
    let room = '';
    let previousRow = null;
    for (const line of page.lines) {
      const roomMatch = line.text.match(/\bRoom:\s*(.+)$/i);
      if (roomMatch) { room = clean(roomMatch[1]); previousRow = null; continue; }
      if (!room) continue;
      const lineItem = quoteColumn(line, 18, 42);
      const quantityText = quoteColumn(line, 42, 58);
      const model = quoteColumn(line, 58, 164);
      const description = quoteColumn(line, 164, 448);
      const quantity = Number(quantityText);
      if (/^\d+$/.test(lineItem) && Number.isFinite(quantity) && quantity >= 0 && model) {
        previousRow = { room, model, description, quantity, pageNumber: page.pageNumber };
        rawRows.push(previousRow);
      } else if (previousRow && description && !/^(?:description|lighting|total|unit price|ext price|discount)\b/i.test(description)) {
        previousRow.description = clean(`${previousRow.description} ${description}`);
      }
    }
  }

  const allText = pageLines.flatMap(page => page.lines.map(line => line.text)).join('\n');
  const firstPage = pageLines[0];
  const titleItems = (firstPage?.items || []).map(value => ({ text: clean(value.str), x: Number(value.transform?.[4] ?? 0), y: Number(value.transform?.[5] ?? 0), height: Number(value.height || 0) }))
    .filter(value => value.text && value.x < 430 && value.height >= 20 && value.y > 460 && value.y < 650).sort((left, right) => right.y - left.y || left.x - right.x);
  let title = clean(titleItems.map(value => value.text).join(' '));
  title = title.replace(/^APPLE STORE\s+/i, '');
  const titleParts = title.split(/\s+-\s+/).map(clean).filter(Boolean);
  const project = titleParts.length >= 2 ? `${titleParts[0]} - ${titleCaseProject(titleParts[1])}` : titleCaseProject(title);
  const date = allText.match(/Date Created:\s*(\d{1,2}\/\d{1,2}\/\d{4})/i)?.[1] || '';
  const preparedBy = allText.match(/Prepared By:\s*([^\n]+)/i)?.[1] || '';
  const revisionMatches = [...allText.matchAll(/\bREV\s*0?(\d+)\s+(\d{1,2}\/\d{1,2}\/\d{4})\s+([A-Z]{2,5})\b/gi)];
  const revision = revisionMatches.at(-1);

  const expandedRows = [];
  for (const row of rawRows) {
    const sku = normalizeQuoteSku(row.model);
    if (!sku || sku.startsWith('CONFIG:') || sku === 'DOCUMENTATION') continue;
    if (sku === 'GLPX-HDSW-FT-56-NR') {
      for (const replacement of ['GLEX-FT-56-HC', 'GLXX-CTRL', 'GLXX-HDSW16']) expandedRows.push({ section: quoteSection(row.room, replacement), sku: replacement, description: quoteReplacementDescriptions[replacement], quantity: row.quantity });
      continue;
    }
    expandedRows.push({ section: quoteSection(row.room, sku), sku, description: clean(row.description), quantity: row.quantity });
  }
  const aggregate = new Map();
  for (const row of expandedRows.filter(row => row.section)) {
    const key = `${row.section}\u0000${row.sku}`;
    const current = aggregate.get(key);
    if (current) current.quantity += row.quantity;
    else aggregate.set(key, { ...row });
  }
  const sectionOrder = new Map(defaultSections.map((section, index) => [section.id, index]));
  const rows = [...aggregate.values()].sort((left, right) => (sectionOrder.get(left.section) ?? 99) - (sectionOrder.get(right.section) ?? 99) || (quoteSortOrder.get(left.sku) ?? 999) - (quoteSortOrder.get(right.sku) ?? 999) || left.sku.localeCompare(right.sku));
  if (!rows.length) throw new Error('No usable CDTL quote line items were found. Confirm this is a line-item CDTL quote PDF.');
  return {
    metadata: {
      project,
      creator: revision?.[3] || clean(preparedBy),
      date: dateToInput(revision?.[2] || date),
      revision: revision?.[1]?.padStart(2, '0') || clean(allText.match(/Quote\s*#?\s*:?\s*\d+\s+Rev\.?\s*(\d+)/i)?.[1]),
    },
    quoteNumber: clean(allText.match(/Quote\s*#?\s*:?\s*(\d+)/i)?.[1]),
    rows,
    sourceRowCount: rawRows.length,
  };
}

async function parseCdtlQuotePdf(arrayBuffer, onProgress = () => {}) {
  const pdfjs = await import(PDF_MODULE_URL);
  pdfjs.GlobalWorkerOptions.workerSrc = PDF_WORKER_URL;
  const pdf = await pdfjs.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pages = [];
  for (let index = 1; index <= pdf.numPages; index++) {
    onProgress(index, pdf.numPages);
    const page = await pdf.getPage(index);
    const text = await page.getTextContent();
    pages.push({ pageNumber: index, items: text.items });
  }
  if (pages.reduce((sum, page) => sum + page.items.length, 0) < 20) throw new Error('This quote does not contain a usable text layer. Export a searchable PDF and try again.');
  return parseCdtlQuotePages(pages);
}

function xlsxCell(reference, value, style = 0) {
  if (typeof value === 'number') return `<c r="${reference}" s="${style}"><v>${value}</v></c>`;
  return `<c r="${reference}" t="inlineStr" s="${style}"><is><t xml:space="preserve">${xml(value)}</t></is></c>`;
}
async function buildXlsx(rows, metadata, sectionDefinitions = defaultSections) {
  if (!globalThis.JSZip) throw new Error('The Excel exporter is unavailable.');
  const zip = new globalThis.JSZip();
  const sheetRows = [];
  const merges = ['A1:C1'];
  sheetRows.push(`<row r="1" ht="28" customHeight="1">${xlsxCell('A1', 'Apple Bill of Materials', 1)}</row>`);
  sheetRows.push(`<row r="3">${xlsxCell('A3', 'Project', 2)}${xlsxCell('B3', metadata.project)}${xlsxCell('C3', 'Created by', 2)}${xlsxCell('D3', metadata.creator)}${xlsxCell('E3', 'Date', 2)}${xlsxCell('F3', metadata.date)}${xlsxCell('G3', 'Revision', 2)}${xlsxCell('H3', metadata.revision)}</row>`);
  let rowNumber = 5;
  for (const section of sectionDefinitions) {
    const groupRows = rows.filter(row => row.section === section.id);
    sheetRows.push(`<row r="${rowNumber}" ht="23" customHeight="1">${xlsxCell(`A${rowNumber}`, `${section.group} — ${section.label}`, 3)}</row>`); merges.push(`A${rowNumber}:H${rowNumber}`); rowNumber++;
    sheetRows.push(`<row r="${rowNumber}">${xlsxCell(`A${rowNumber}`, 'Quantity', 4)}${xlsxCell(`B${rowNumber}`, 'Part Number', 4)}${xlsxCell(`C${rowNumber}`, 'Description', 4)}</row>`); merges.push(`C${rowNumber}:H${rowNumber}`); rowNumber++;
    if (!groupRows.length) { sheetRows.push(`<row r="${rowNumber}">${xlsxCell(`A${rowNumber}`, 0, 5)}${xlsxCell(`B${rowNumber}`, '', 5)}${xlsxCell(`C${rowNumber}`, '', 5)}</row>`); merges.push(`C${rowNumber}:H${rowNumber}`); rowNumber++; }
    for (const row of groupRows) { sheetRows.push(`<row r="${rowNumber}" ht="24" customHeight="1">${xlsxCell(`A${rowNumber}`, Math.max(0, Number(row.quantity) || 0), 5)}${xlsxCell(`B${rowNumber}`, row.sku, 5)}${xlsxCell(`C${rowNumber}`, row.description, 5)}</row>`); merges.push(`C${rowNumber}:H${rowNumber}`); rowNumber++; }
    rowNumber++;
  }
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>');
  zip.file('_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>');
  zip.file('xl/workbook.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Apple BOM" sheetId="1" r:id="rId1"/></sheets></workbook>');
  zip.file('xl/_rels/workbook.xml.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>');
  zip.file('xl/styles.xml', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="10"/><name val="Arial"/></font><font><b/><sz val="19"/><color rgb="FF004B76"/><name val="Arial"/></font><font><b/><sz val="9"/><color rgb="FF456477"/><name val="Arial"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF004B76"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF007EA8"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFB9C9D2"/></left><right style="thin"><color rgb="FFB9C9D2"/></right><top style="thin"><color rgb="FFB9C9D2"/></top><bottom style="thin"><color rgb="FFB9C9D2"/></bottom><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf><xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>');
  zip.file('xl/worksheets/sheet1.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="4" topLeftCell="A5" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="12" customWidth="1"/><col min="2" max="2" width="28" customWidth="1"/><col min="3" max="8" width="18" customWidth="1"/></cols><sheetData>${sheetRows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells><pageMargins left="0.3" right="0.3" top="0.45" bottom="0.45" header="0.2" footer="0.2"/><pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/></worksheet>`);
  return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });
}

async function buildPdf(rows, metadata, sectionDefinitions = defaultSections) {
  if (!globalThis.PDFLib) throw new Error('The PDF exporter is unavailable.');
  const { PDFDocument, StandardFonts, rgb } = globalThis.PDFLib;
  const pdf = await PDFDocument.create();
  const regular = await pdf.embedFont(StandardFonts.Helvetica), bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const pageSize = [792, 612], margin = 34, widths = [58, 170, 496];
  let page, y;
  const addPage = async () => {
    page = pdf.addPage(pageSize); y = 574;
    const logo = document.getElementById('bom-export-logo');
    if (logo?.src?.startsWith('data:image/png')) { try { const bytes = Uint8Array.from(atob(logo.src.split(',')[1]), character => character.charCodeAt(0)); const image = await pdf.embedPng(bytes); const scaled = image.scaleToFit(170, 40); page.drawImage(image, { x: margin, y: y - scaled.height + 8, width: scaled.width, height: scaled.height }); } catch {} }
    page.drawText('APPLE BILL OF MATERIALS', { x: 520, y: y - 2, size: 15, font: bold, color: rgb(0, .29, .46) }); y -= 54;
    const meta = [`Project: ${metadata.project || ''}`, `Created by: ${metadata.creator || ''}`, `Date: ${metadata.date || ''}`, `Revision: ${metadata.revision || ''}`].map(pdfText);
    meta.forEach((value, index) => page.drawText(value, { x: margin + (index % 2) * 365, y: y - Math.floor(index / 2) * 17, size: 9, font: regular, color: rgb(.18, .24, .31) })); y -= 46;
  };
  const textLines = (text, max, size = 8.5) => { const words = pdfText(text).split(' '); const lines = []; let line = ''; for (const word of words) { const candidate = line ? `${line} ${word}` : word; if (regular.widthOfTextAtSize(candidate, size) <= max) line = candidate; else { if (line) lines.push(line); line = word; } } if (line) lines.push(line); return lines.length ? lines : ['']; };
  await addPage();
  for (const section of sectionDefinitions) {
    const groupRows = rows.filter(row => row.section === section.id);
    const required = 54 + Math.max(1, groupRows.length) * 30;
    if (y - required < 35) await addPage();
    page.drawRectangle({ x: margin, y: y - 22, width: 724, height: 22, color: rgb(.06, .09, .15) });
    page.drawText(pdfText(`${section.group} - ${section.label}`), { x: margin + 8, y: y - 15, size: 10, font: bold, color: rgb(1, 1, 1) }); y -= 22;
    ['QTY', 'PART NUMBER', 'DESCRIPTION'].forEach((label, index) => page.drawText(label, { x: margin + [8, widths[0] + 8, widths[0] + widths[1] + 8][index], y: y - 16, size: 8, font: bold, color: rgb(1, 1, 1) }));
    page.drawRectangle({ x: margin, y: y - 23, width: 724, height: 23, color: rgb(0, .49, .66) }); y -= 23;
    const actualRows = groupRows.length ? groupRows : [{ quantity: 0, sku: '', description: '' }];
    for (const row of actualRows) {
      const lines = textLines(row.description, widths[2] - 16); const height = Math.max(28, lines.length * 11 + 8);
      if (y - height < 35) await addPage();
      page.drawRectangle({ x: margin, y: y - height, width: 724, height, borderWidth: .5, borderColor: rgb(.7, .77, .81) });
      page.drawText(String(Math.max(0, Number(row.quantity) || 0)), { x: margin + 10, y: y - 18, size: 9, font: regular });
      page.drawText(pdfText(row.sku), { x: margin + widths[0] + 8, y: y - 18, size: 9, font: regular });
      lines.forEach((line, index) => page.drawText(line, { x: margin + widths[0] + widths[1] + 8, y: y - 17 - index * 11, size: 8.5, font: regular })); y -= height;
    }
    y -= 12;
  }
  return pdf.save();
}

function buildCsv(rows, sectionDefinitions = defaultSections) {
  const data = [['Group', 'Section', 'Quantity', 'Part Number', 'Description']];
  for (const section of sectionDefinitions) for (const row of rows.filter(item => item.section === section.id)) data.push([section.group, section.label, Math.max(0, Number(row.quantity) || 0), row.sku, row.description]);
  return new TextEncoder().encode(data.map(row => row.map(csvValue).join(',')).join('\r\n'));
}

function init() {
  const root = document.getElementById('apple-bom-view'); if (!root) return;
  const byId = id => document.getElementById(id);
  const elements = { preset: byId('apple-bom-preset'), catalog: byId('apple-bom-catalog'), project: byId('apple-bom-project'), creator: byId('apple-bom-creator'), date: byId('apple-bom-date'), revision: byId('apple-bom-revision'), loadPreset: byId('apple-bom-load-preset'), importQuote: byId('apple-bom-import-quote'), quoteFile: byId('apple-bom-quote-file'), addSection: byId('apple-bom-add-section'), savePreset: byId('apple-bom-save-preset'), deletePreset: byId('apple-bom-delete-preset'), sections: byId('apple-bom-sections'), pdf: byId('apple-bom-export-pdf'), xlsx: byId('apple-bom-export-xlsx'), csv: byId('apple-bom-export-csv'), documents: byId('apple-bom-export-documents'), documentTypes: byId('apple-bom-document-types'), documentOptions: byId('apple-bom-document-options'), documentRecommended: byId('apple-bom-doc-recommended'), documentAll: byId('apple-bom-doc-all'), documentNone: byId('apple-bom-doc-none'), export: byId('apple-bom-export'), status: byId('apple-bom-status') };
  const catalogs = parseCatalogs();
  const state = { sections: cloneSections(), rows: [], customPresets: loadCustomPresets(), activeRow: '', catalogId: catalogs[0]?.id || '' };
  elements.date.value = new Date().toISOString().slice(0, 10);
  elements.catalog.innerHTML = catalogs.map(list => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.label || list.name || list.id)}</option>`).join('') || '<option value="">No catalog available</option>';

  function setStatus(message, stateName = '') { elements.status.textContent = message; elements.status.dataset.state = stateName; }
  function matchedDocuments(rows = state.rows) {
    const skus = [...new Set(rows.map(row => clean(row.sku)).filter(Boolean))];
    return globalThis.CrestronBudgetTool?.matchDocuments(skus) || { count: 0, bytes: 0, documents: [], missingSkus: [] };
  }
  function documentTypeLabel(documentRecord) { return clean(documentRecord.displayDocumentType || documentRecord.documentType || 'Other Documents'); }
  function prepareDocumentTypes(matches = matchedDocuments()) {
    const previous = new Map([...elements.documentOptions.querySelectorAll('input')].map(input => [input.value, input.checked]));
    const counts = new Map();
    for (const documentRecord of matches.documents || []) {
      const label = documentTypeLabel(documentRecord);
      counts.set(label, (counts.get(label) || 0) + 1);
    }
    elements.documentOptions.innerHTML = [...counts].sort((left, right) => left[0].localeCompare(right[0])).map(([label, count]) => `<label><input type="checkbox" value="${escapeHtml(label)}" ${previous.has(label) ? (previous.get(label) ? 'checked' : '') : 'checked'}><span>${escapeHtml(label)} <small>(${count})</small></span></label>`).join('') || '<p class="apple-bom-empty">No matched product documents were found for the current parts.</p>';
    elements.documentTypes.hidden = !elements.documents.checked;
    return matches;
  }
  function selectedDocumentTypes() { return new Set([...elements.documentOptions.querySelectorAll('input:checked')].map(input => input.value)); }
  function filterDocumentMatches(matches) {
    const selected = selectedDocumentTypes();
    const documents = (matches.documents || []).filter(documentRecord => selected.has(documentTypeLabel(documentRecord)));
    return { ...matches, count: documents.length, documents, hashes: documents.map(documentRecord => documentRecord.sha), bytes: documents.reduce((sum, documentRecord) => sum + (Number(documentRecord.bytes) || 0), 0) };
  }
  function catalogDescription(sku, fallback) {
    const matches = globalThis.CrestronBudgetTool?.matchProducts(sku, state.catalogId, 8) || [];
    const canonical = clean(sku).toUpperCase().replace(/[^A-Z0-9]/g, '');
    const exact = matches.find(match => clean(match.sku).toUpperCase().replace(/[^A-Z0-9]/g, '') === canonical);
    return clean(exact?.description || exact?.name || fallback);
  }
  function applyQuote(result) {
    state.sections = cloneSections();
    state.rows = result.rows.map(row => ({ ...item(row.section, row.sku, catalogDescription(row.sku, row.description)), quantity: Math.max(0, Number(row.quantity) || 0) }));
    const metadata = result.metadata || {};
    elements.project.value = clean(metadata.project);
    elements.creator.value = clean(metadata.creator);
    elements.date.value = clean(metadata.date) || new Date().toISOString().slice(0, 10);
    elements.revision.value = clean(metadata.revision);
    state.activeRow = '';
    render();
    if (elements.documents.checked) prepareDocumentTypes();
  }
  function saveDraft() { try { localStorage.setItem(DRAFT_KEY, JSON.stringify(serialize())); } catch {} }
  function refreshPresets(selected) {
    const custom = Object.entries(state.customPresets).map(([id, preset]) => `<option value="custom:${escapeHtml(id)}">${escapeHtml(preset.name)}</option>`).join('');
    elements.preset.innerHTML = '<option value="legacy">Legacy</option><option value="zum">ZUM BOM</option>' + custom;
    if (selected && [...elements.preset.options].some(option => option.value === selected)) elements.preset.value = selected;
    elements.deletePreset.hidden = !elements.preset.value.startsWith('custom:');
  }
  function ensurePanelRows() {
    for (const id of ['cpp-panel', 'rp-panel']) if (state.sections.some(section => section.id === id) && !state.rows.some(row => row.section === id)) state.rows.push(item(id, '', ''));
  }
  function render() {
    ensurePanelRows();
    elements.sections.innerHTML = state.sections.map(section => {
      const rows = state.rows.filter(row => row.section === section.id);
      const body = rows.length ? rows.map(row => `<tr data-row="${row.id}"><td><input type="number" min="0" step="1" data-field="quantity" value="${Math.max(0, Number(row.quantity) || 0)}" aria-label="Quantity"></td><td><input type="text" data-field="sku" value="${escapeHtml(row.sku)}" autocomplete="off" spellcheck="false" aria-label="Part number">${state.activeRow === row.id ? '<div class="apple-bom-suggestions" data-suggestions></div>' : ''}</td><td><div class="apple-bom-description">${escapeHtml(row.description || 'Choose a product match to load its description.')}</div></td><td><button class="apple-bom-delete" type="button" data-delete aria-label="Delete row">×</button></td></tr>`).join('') : `<tr><td colspan="4" class="apple-bom-empty">No items in this section.</td></tr>`;
      return `<section class="apple-bom-section" data-section="${section.id}"><div class="apple-bom-section-head"><div><h2>${escapeHtml(section.group)} · ${escapeHtml(section.label)}</h2>${section.note ? `<p>${escapeHtml(section.note)}</p>` : ''}</div><div class="apple-bom-section-actions"><button class="tool-button" type="button" data-rename="${section.id}">Rename</button><button class="tool-button" type="button" data-duplicate="${section.id}">Duplicate</button><button class="tool-button" type="button" data-add="${section.id}">+ Add line</button></div></div><div class="apple-bom-table-wrap"><table class="apple-bom-table"><thead><tr><th>Qty</th><th>Part number</th><th>Description</th><th></th></tr></thead><tbody>${body}</tbody></table></div></section>`;
    }).join('');
    elements.sections.querySelectorAll('[data-row]').forEach(rowElement => {
      const row = state.rows.find(value => value.id === rowElement.dataset.row); if (!row) return;
      const quantity = rowElement.querySelector('[data-field="quantity"]'), sku = rowElement.querySelector('[data-field="sku"]');
      quantity.addEventListener('change', () => { row.quantity = Math.max(0, Number(quantity.value) || 0); saveDraft(); });
      sku.addEventListener('focus', () => { if (state.activeRow === row.id) { renderSuggestions(row); return; } state.activeRow = row.id; render(); const target = elements.sections.querySelector(`[data-row="${row.id}"] [data-field="sku"]`); target?.focus(); target?.setSelectionRange(target.value.length, target.value.length); renderSuggestions(row); });
      sku.addEventListener('input', () => { row.sku = sku.value; row.description = ''; state.activeRow = row.id; renderSuggestions(row); saveDraft(); });
      rowElement.querySelector('[data-delete]').addEventListener('click', () => { state.rows = state.rows.filter(value => value.id !== row.id); state.activeRow = ''; render(); saveDraft(); });
    });
    elements.sections.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => { const row = item(button.dataset.add, '', ''); state.rows.push(row); state.activeRow = row.id; render(); const input = elements.sections.querySelector(`[data-row="${row.id}"] [data-field="sku"]`); input?.focus(); }));
    elements.sections.querySelectorAll('[data-rename]').forEach(button => button.addEventListener('click', () => {
      const section = state.sections.find(value => value.id === button.dataset.rename); if (!section) return;
      const group = clean(prompt('Section group or panel name:', section.group)); if (!group) return;
      const label = clean(prompt('Section name:', section.label)); if (!label) return;
      section.group = group; section.label = label; render(); setStatus(`Section renamed to ${group} · ${label}.`, 'ready');
    }));
    elements.sections.querySelectorAll('[data-duplicate]').forEach(button => button.addEventListener('click', () => {
      const sourceIndex = state.sections.findIndex(value => value.id === button.dataset.duplicate); if (sourceIndex < 0) return;
      const source = state.sections[sourceIndex]; const id = sectionId();
      const duplicate = { ...source, id, label: `${source.label} Copy`, note: '' };
      state.sections.splice(sourceIndex + 1, 0, duplicate);
      const copiedRows = state.rows.filter(row => row.section === source.id).map(row => ({ ...item(id, row.sku, row.description), quantity: Math.max(0, Number(row.quantity) || 0) }));
      state.rows.push(...copiedRows); state.activeRow = ''; render(); setStatus(`${source.group} · ${source.label} duplicated.`, 'ready');
    }));
    saveDraft();
  }
  function renderSuggestions(row) {
    const host = elements.sections.querySelector(`[data-row="${row.id}"] [data-suggestions]`); if (!host) return;
    const matches = globalThis.CrestronBudgetTool?.matchProducts(row.sku, state.catalogId, 8) || [];
    if (!clean(row.sku) || !matches.length) { host.innerHTML = '<button type="button" disabled>No catalog matches yet</button>'; return; }
    host.innerHTML = matches.map(match => `<button type="button" data-sku="${escapeHtml(match.sku)}"><strong>${escapeHtml(match.sku)}</strong><small>${escapeHtml(match.description || match.name)}</small></button>`).join('');
    host.querySelectorAll('[data-sku]').forEach(button => button.addEventListener('mousedown', event => { event.preventDefault(); const match = matches.find(value => value.sku === button.dataset.sku); if (!match) return; row.sku = match.sku; row.description = match.description || match.name || ''; state.activeRow = ''; render(); }));
  }
  function serialize() { return { catalogId: state.catalogId, metadata: { project: elements.project.value, creator: elements.creator.value, date: elements.date.value, revision: elements.revision.value }, sections: cloneSections(state.sections), rows: state.rows.map(({ section, sku, description, quantity }) => ({ section, sku, description, quantity })) }; }
  function deserialize(payload) {
    if (!payload || !Array.isArray(payload.rows)) throw new Error('This Apple BOM work file is invalid.');
    state.sections = Array.isArray(payload.sections) && payload.sections.length ? cloneSections(payload.sections.slice(0, 100)) : cloneSections();
    const validSectionIds = new Set(state.sections.map(section => section.id));
    state.rows = cloneRows(payload.rows.filter(row => validSectionIds.has(row.section)).slice(0, 1000));
    state.catalogId = catalogs.some(list => list.id === payload.catalogId) ? payload.catalogId : (catalogs[0]?.id || ''); elements.catalog.value = state.catalogId;
    const metadata = payload.metadata || {}; elements.project.value = clean(metadata.project); elements.creator.value = clean(metadata.creator); elements.date.value = clean(metadata.date) || new Date().toISOString().slice(0, 10); elements.revision.value = clean(metadata.revision);
    state.activeRow = ''; render(); return state.rows.length;
  }
  function applyPreset(id) {
    const preset = id.startsWith('custom:') ? state.customPresets[id.slice(7)] : builtIns[id];
    if (!preset) return;
    state.sections = Array.isArray(preset.sections) && preset.sections.length ? cloneSections(preset.sections) : cloneSections();
    state.rows = cloneRows(preset.rows, true); state.activeRow = ''; render(); setStatus(`${preset.name} loaded with quantities set to zero.`, 'ready');
  }

  refreshPresets('zum'); applyPreset('zum');
  try { const draft = JSON.parse(localStorage.getItem(DRAFT_KEY) || 'null'); if (draft?.rows?.length) deserialize(draft); } catch {}
  elements.catalog.addEventListener('change', () => { state.catalogId = elements.catalog.value; saveDraft(); });
  elements.preset.addEventListener('change', () => { elements.deletePreset.hidden = !elements.preset.value.startsWith('custom:'); });
  elements.loadPreset.addEventListener('click', () => applyPreset(elements.preset.value));
  elements.addSection.addEventListener('click', () => {
    const group = clean(prompt('Section group or panel name:', 'Custom')); if (!group) return;
    const label = clean(prompt('Section name:', 'New Section')); if (!label) return;
    const section = { id: sectionId(), group, label, note: '' };
    state.sections.push(section); state.rows.push(item(section.id, '', '')); state.activeRow = '';
    render(); setStatus(`${group} · ${label} added.`, 'ready');
    elements.sections.querySelector(`[data-section="${section.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  });
  elements.savePreset.addEventListener('click', () => {
    const name = clean(prompt('Name this Apple BOM preset:')); if (!name) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    state.customPresets[id] = { name, sections: cloneSections(state.sections), rows: state.rows.map(({ section, sku, description }) => ({ section, sku, description, quantity: 0 })) };
    saveCustomPresets(state.customPresets); refreshPresets(`custom:${id}`); setStatus(`Preset “${name}” saved on this device.`, 'ready');
  });
  elements.deletePreset.addEventListener('click', () => { const id = elements.preset.value.replace(/^custom:/, ''); const preset = state.customPresets[id]; if (!preset || !confirm(`Delete preset “${preset.name}”?`)) return; delete state.customPresets[id]; saveCustomPresets(state.customPresets); refreshPresets('zum'); setStatus('Custom preset deleted.', 'ready'); });
  [elements.project, elements.creator, elements.date, elements.revision].forEach(input => input.addEventListener('change', saveDraft));

  elements.importQuote.addEventListener('click', () => elements.quoteFile.click());
  elements.quoteFile.addEventListener('change', async () => {
    const file = elements.quoteFile.files?.[0];
    elements.quoteFile.value = '';
    if (!file) return;
    if (state.rows.some(row => clean(row.sku) && Number(row.quantity) > 0) && !confirm('Replace the current Apple BOM quantities and parts with this CDTL quote?')) return;
    elements.importQuote.disabled = true;
    elements.importQuote.textContent = 'Reading quote…';
    setStatus(`Reading ${file.name}…`);
    try {
      const result = await parseCdtlQuotePdf(await file.arrayBuffer(), (page, total) => setStatus(`Reading CDTL quote page ${page} of ${total}…`));
      applyQuote(result);
      setStatus(`Quote ${result.quoteNumber || file.name} imported: ${result.rows.length} BOM line${result.rows.length === 1 ? '' : 's'} populated.`, 'ready');
    } catch (error) {
      setStatus(error.message || 'The CDTL quote could not be imported.', 'error');
    } finally {
      elements.importQuote.disabled = false;
      elements.importQuote.textContent = 'Import CDTL Quote';
    }
  });

  elements.documents.addEventListener('change', () => {
    elements.documentTypes.hidden = !elements.documents.checked;
    if (elements.documents.checked) prepareDocumentTypes();
  });
  elements.documentAll.addEventListener('click', () => elements.documentOptions.querySelectorAll('input').forEach(input => { input.checked = true; }));
  elements.documentNone.addEventListener('click', () => elements.documentOptions.querySelectorAll('input').forEach(input => { input.checked = false; }));
  elements.documentRecommended.addEventListener('click', () => elements.documentOptions.querySelectorAll('input').forEach(input => { input.checked = /spec|installation|quick start|product manual|user guide/i.test(input.value); }));

  elements.export.addEventListener('click', async () => {
    const formats = [elements.pdf.checked && 'pdf', elements.xlsx.checked && 'xlsx', elements.csv.checked && 'csv'].filter(Boolean);
    if (!formats.length) { setStatus('Choose at least one export format.', 'error'); return; }
    const usableRows = state.rows.filter(row => clean(row.sku)); if (!usableRows.length) { setStatus('Add at least one part before exporting.', 'error'); return; }
    elements.export.disabled = true; elements.export.textContent = 'Preparing export…'; setStatus('Building selected files…');
    try {
      const metadata = { project: clean(elements.project.value), creator: clean(elements.creator.value), date: clean(elements.date.value), revision: clean(elements.revision.value) };
      const stem = `${safeName(metadata.project || 'Apple_Project')}_Apple_BOM`;
      const files = [];
      if (elements.pdf.checked) files.push({ name: `${stem}.pdf`, mimeType: 'application/pdf', bytes: await buildPdf(usableRows, metadata, state.sections) });
      if (elements.xlsx.checked) files.push({ name: `${stem}.xlsx`, mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', bytes: await buildXlsx(usableRows, metadata, state.sections) });
      if (elements.csv.checked) files.push({ name: `${stem}.csv`, mimeType: 'text/csv;charset=utf-8', bytes: buildCsv(usableRows, state.sections) });
      let matches = null;
      if (elements.documents.checked) {
        const allMatches = prepareDocumentTypes(matchedDocuments(usableRows));
        matches = filterDocumentMatches(allMatches);
        if (!matches.documents.length) throw new Error('Select at least one matched product document type before exporting.');
      }
      const endpoint = globalThis.CrestronBudgetTool?.applicationEndpoint('/api/export');
      if (endpoint) {
        const response = await fetch(endpoint, { method: 'POST', credentials: 'same-origin', cache: 'no-store', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ packageName: stem, includeDocuments: Boolean(elements.documents.checked), files: files.map(file => ({ name: file.name, mimeType: file.mimeType, base64: bytesToBase64(file.bytes) })), documents: matches?.documents || [] }) });
        if (!response.ok) { let value = {}; try { value = await response.json(); } catch {} throw new Error(value.error || `Export service returned ${response.status}.`); }
        const blob = await response.blob(); const disposition = response.headers.get('Content-Disposition') || ''; const name = disposition.match(/filename="?([^";]+)"?/i)?.[1] || `${stem}${files.length > 1 || elements.documents.checked ? '.zip' : '.' + formats[0]}`; download(blob, name);
      } else if (elements.documents.checked) throw new Error('Matched documents require the connected Project Tools application.');
      else if (files.length === 1) download(new Blob([files[0].bytes], { type: files[0].mimeType }), files[0].name);
      else { const zip = new globalThis.JSZip(); files.forEach(file => zip.file(file.name, file.bytes)); download(await zip.generateAsync({ type: 'blob' }), `${stem}.zip`); }
      setStatus(`Export ready${matches ? ` with ${matches.count} unique matched document${matches.count === 1 ? '' : 's'}` : ''}.`, 'ready');
    } catch (error) { setStatus(error.message || 'The Apple BOM could not be exported.', 'error'); }
    finally { elements.export.disabled = false; elements.export.textContent = 'Export Apple BOM'; }
  });

  globalThis.ProjectToolsAppleBom = Object.freeze({ serialize, deserialize, presets: () => ({ builtIn: Object.keys(builtIns), custom: Object.values(state.customPresets).map(value => value.name) }) });
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
}

export { builtIns, defaultSections as sections, buildCsv, buildPdf, buildXlsx, groupQuoteLines, parseCdtlQuotePages, parseCdtlQuotePdf };
