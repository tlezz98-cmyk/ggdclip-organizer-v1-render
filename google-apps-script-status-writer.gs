const SECRET_PROPERTY_NAME = 'STATUS_WRITER_SECRET';
const DEFAULT_MANUAL_ENTRY_GID = '2021660849';

const POSITION_HEADERS = ['???????'];
const ORDER_HEADERS = ['?????'];
const SUBJECT_HEADERS = ['????????/??????', '?????????????', '????', '??????'];
const CLIP_STATUS_HEADERS = [
  '??????????????',
  '??????????????',
  '?????????????',
  '?????????????',
  '?????????',
  '?????'
];
const DOCUMENT_STATUS_HEADERS = [
  '????????????????',
  '????????????????',
  '???????????',
  '???????????',
  '???????????'
];
const LATEST_UPDATE_HEADERS = ['????????????', '????????????', '???????????'];
const LATEST_UPDATE_ITEM_HEADERS = ['??????????????????', '??????????????????', '???????????????????'];
const UPDATE_HISTORY_HEADERS = ['?????????????', '????????????????', '?????????????', '????????????????'];

function doPost(e) {
  try {
    const body = parseBody(e);
    verifySecret(body.secret || '');
    const result = updateSubjectStatus(body);
    return jsonOutput({ ok: true, ...result });
  } catch (error) {
    return jsonOutput({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function parseBody(e) {
  const text = e && e.postData && e.postData.contents ? e.postData.contents : '{}';
  return JSON.parse(text || '{}');
}

function verifySecret(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY_NAME) || '';
  if (expected && String(secret || '') !== expected) {
    throw new Error('secret ??????????');
  }
}

function updateSubjectStatus(payload) {
  const spreadsheetId = extractSpreadsheetId(payload.sheetUrl || '');
  if (!spreadsheetId) throw new Error('????? spreadsheet id');

  const statusType = cleanCell(payload.statusType || '');
  const nextStatus = canonicalStatus(payload.status || '');
  if (statusType !== 'clip' && statusType !== 'document') {
    throw new Error('?????????????????????');
  }
  if (!nextStatus) {
    throw new Error('????????????? ????????????? ???? ??????????? ????????');
  }

  const position = cleanCell(payload.position || '');
  const order = cleanCell(payload.order || '');
  const title = cleanCell(payload.title || '');
  if (!position || !order || !title) {
    throw new Error('?????????????/?????/??????????????');
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = sheetByGid(ss, payload.gid || DEFAULT_MANUAL_ENTRY_GID);
  if (!sheet) throw new Error('??????????????????????');

  const values = sheet.getDataRange().getValues();
  const header = (values[0] || []).map(cleanCell);
  const positionIndex = columnIndex(header, POSITION_HEADERS);
  const orderIndex = columnIndex(header, ORDER_HEADERS);
  const subjectIndex = columnIndex(header, SUBJECT_HEADERS);
  const clipStatusIndex = columnIndex(header, CLIP_STATUS_HEADERS);
  const documentStatusIndex = columnIndex(header, DOCUMENT_STATUS_HEADERS);
  const latestUpdateIndex = ensureColumn(sheet, header, LATEST_UPDATE_HEADERS, '????????????');
  const latestUpdateItemIndex = ensureColumn(sheet, header, LATEST_UPDATE_ITEM_HEADERS, '??????????????????');
  const updateHistoryIndex = ensureColumn(sheet, header, UPDATE_HISTORY_HEADERS, '?????????????');

  if (positionIndex < 0 || orderIndex < 0 || subjectIndex < 0) {
    throw new Error('???????????????????/?????/?????????????');
  }

  const targetColumnIndex = statusType === 'clip' ? clipStatusIndex : documentStatusIndex;
  if (targetColumnIndex < 0) {
    throw new Error(statusType === 'clip'
      ? '???????????????????????????????'
      : '????????????????????????????');
  }

  const matches = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    if (
      sameSheetKey(row[positionIndex], position) &&
      sameSheetKey(row[orderIndex], order) &&
      sameSheetKey(row[subjectIndex], title)
    ) {
      matches.push({ rowNumber: i + 1, row });
    }
  }

  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? '????????????????????????/?????/???????????'
      : '?????????????????? (' + matches.length + ' ???) ????????????????????????????');
  }

  const match = matches[0];
  const previousStatus = cleanCell(match.row[targetColumnIndex]);
  const updatedAt = new Date().toISOString();
  const latestUpdateItem = (statusType === 'clip' ? '?????????' : '???????????') + ': ' + nextStatus + ' ? ' + title;
  const historyEntry = { at: updatedAt, type: statusType, status: nextStatus, title: title };
  const updateHistory = buildUpdateHistoryValue(match.row[updateHistoryIndex], historyEntry);

  sheet.getRange(match.rowNumber, targetColumnIndex + 1).setValue(nextStatus);
  sheet.getRange(match.rowNumber, latestUpdateIndex + 1).setValue(updatedAt);
  sheet.getRange(match.rowNumber, latestUpdateItemIndex + 1).setValue(latestUpdateItem);
  sheet.getRange(match.rowNumber, updateHistoryIndex + 1).setValue(updateHistory);
  SpreadsheetApp.flush();

  return {
    spreadsheetId,
    sheetName: sheet.getName(),
    rowNumber: match.rowNumber,
    statusType,
    previousStatus,
    status: nextStatus,
    updatedAt,
    latestUpdateItem,
    updateHistory,
    updatedCells: 4
  };
}

function extractSpreadsheetId(value) {
  const text = String(value || '');
  const match = text.match(/\/spreadsheets\/d\/([^/]+)/);
  return match ? match[1] : text.trim();
}

function sheetByGid(ss, gid) {
  const target = String(gid || DEFAULT_MANUAL_ENTRY_GID);
  return ss.getSheets().find(sheet => String(sheet.getSheetId()) === target) || null;
}

function columnIndex(header, names) {
  for (const name of names) {
    const index = header.indexOf(cleanCell(name));
    if (index >= 0) return index;
  }
  return -1;
}

function ensureColumn(sheet, header, names, defaultName) {
  const existingIndex = columnIndex(header, names);
  if (existingIndex >= 0) return existingIndex;
  const nextColumn = header.length + 1;
  sheet.getRange(1, nextColumn).setValue(defaultName);
  header.push(defaultName);
  return nextColumn - 1;
}

function cleanCell(value) {
  return String(value == null ? '' : value).replace(/^\uFEFF/u, '').trim();
}

function sameSheetKey(a, b) {
  return normalizeKey(a) === normalizeKey(b);
}

function normalizeKey(value) {
  return cleanCell(value).replace(/\s+/g, '').toLowerCase();
}

function canonicalStatus(value) {
  const raw = cleanCell(value);
  const fixed = repairMojibake(raw);
  const normalized = (raw + ' ' + fixed).toLowerCase().replace(/\s+/g, '');
  if (normalized.indexOf('??????') >= 0 || normalized.indexOf('?????') >= 0 || normalized.indexOf('pending') >= 0) {
    return '?????????????';
  }
  if (normalized.indexOf('???????????') >= 0 || normalized.indexOf('???????????') >= 0 || normalized.indexOf('??????') >= 0 || normalized.indexOf('done') >= 0 || normalized.indexOf('complete') >= 0) {
    return '???????????';
  }
  return '';
}

function repairMojibake(value) {
  const text = cleanCell(value);
  if (!text || text.indexOf('?') < 0) return text;
  try {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code <= 255) bytes.push(code);
    }
    if (!bytes.length) return text;
    return Utilities.newBlob(bytes).getDataAsString('UTF-8');
  } catch (error) {
    return text;
  }
}

function parseUpdateHistoryEntries(value) {
  const text = cleanCell(value);
  if (!text) return [];
  try {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) return parsed.filter(Boolean);
  } catch (error) {}
  return text.split(/\n+/).map(line => {
    const parts = line.split(' | ');
    return {
      at: parts[0] || '',
      status: parts[1] || '',
      title: parts.slice(2).join(' | ') || line
    };
  }).filter(entry => entry.title || entry.status || entry.at);
}

function buildUpdateHistoryValue(existingValue, nextEntry) {
  const entries = [nextEntry].concat(parseUpdateHistoryEntries(existingValue))
    .filter(entry => entry && (entry.at || entry.title || entry.status))
    .slice(0, 5);
  return JSON.stringify(entries);
}

function jsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
