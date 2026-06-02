const SECRET_PROPERTY_NAME = "STATUS_WRITER_SECRET";
const DEFAULT_MANUAL_ENTRY_GID = "2021660849";

const TH_POSITION = "\u0e15\u0e33\u0e41\u0e2b\u0e19\u0e48\u0e07";
const TH_ORDER = "\u0e25\u0e33\u0e14\u0e31\u0e1a";
const TH_SUBJECT = "\u0e0a\u0e37\u0e48\u0e2d\u0e27\u0e34\u0e0a\u0e32/\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d";
const TH_PENDING = "\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48\u0e25\u0e07\u0e25\u0e34\u0e07\u0e01\u0e4c";
const TH_DONE = "\u0e25\u0e07\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e41\u0e25\u0e49\u0e27";
const TH_DONE_ALT = "\u0e25\u0e07\u0e25\u0e34\u0e07\u0e04\u0e4c\u0e41\u0e25\u0e49\u0e27";
const TH_CLIP_LABEL = "\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e04\u0e25\u0e34\u0e1b";
const TH_DOCUMENT_LABEL = "\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23";
const TH_LATEST_UPDATE = "\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14";
const TH_LATEST_UPDATE_ITEM = "\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14";
const TH_UPDATE_HISTORY = "\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15";

const POSITION_HEADERS = [TH_POSITION];
const ORDER_HEADERS = [TH_ORDER];
const SUBJECT_HEADERS = [
  TH_SUBJECT,
  "\u0e0a\u0e37\u0e48\u0e2d\u0e27\u0e34\u0e0a\u0e32\u0e43\u0e19\u0e0a\u0e35\u0e15",
  "\u0e27\u0e34\u0e0a\u0e32",
  "\u0e2b\u0e31\u0e27\u0e02\u0e49\u0e2d"
];
const CLIP_STATUS_HEADERS = [
  "\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e04\u0e25\u0e34\u0e1b",
  "\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e25\u0e34\u0e07\u0e04\u0e4c\u0e04\u0e25\u0e34\u0e1b",
  "\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e25\u0e07\u0e01\u0e4c\u0e04\u0e25\u0e34\u0e1b",
  "\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e25\u0e07\u0e04\u0e4c\u0e04\u0e25\u0e34\u0e1b",
  "\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e04\u0e25\u0e34\u0e1b",
  "\u0e2a\u0e16\u0e32\u0e19\u0e30"
];
const DOCUMENT_STATUS_HEADERS = [
  "\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23",
  "\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e25\u0e34\u0e07\u0e04\u0e4c\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23",
  "\u0e2a\u0e16\u0e32\u0e19\u0e30\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23",
  "\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23",
  "\u0e25\u0e34\u0e07\u0e04\u0e4c\u0e40\u0e2d\u0e01\u0e2a\u0e32\u0e23"
];
const LATEST_UPDATE_HEADERS = [
  TH_LATEST_UPDATE,
  "\u0e2d\u0e31\u0e1e\u0e40\u0e14\u0e15\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14",
  "\u0e41\u0e01\u0e49\u0e44\u0e02\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14",
  "\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14"
];
const LATEST_UPDATE_ITEM_HEADERS = [
  TH_LATEST_UPDATE_ITEM,
  "\u0e23\u0e32\u0e22\u0e01\u0e32\u0e23\u0e2d\u0e31\u0e1e\u0e40\u0e14\u0e15\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14",
  "\u0e27\u0e34\u0e0a\u0e32\u0e17\u0e35\u0e48\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14",
  "\u0e27\u0e34\u0e0a\u0e32\u0e17\u0e35\u0e48\u0e2d\u0e31\u0e1e\u0e40\u0e14\u0e15\u0e25\u0e48\u0e32\u0e2a\u0e38\u0e14"
];
const UPDATE_HISTORY_HEADERS = [
  TH_UPDATE_HISTORY,
  "\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e01\u0e32\u0e23\u0e2d\u0e31\u0e1b\u0e40\u0e14\u0e15",
  "\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e2d\u0e31\u0e1e\u0e40\u0e14\u0e15",
  "\u0e1b\u0e23\u0e30\u0e27\u0e31\u0e15\u0e34\u0e01\u0e32\u0e23\u0e2d\u0e31\u0e1e\u0e40\u0e14\u0e15"
];

function doPost(e) {
  try {
    const body = parseBody(e);
    verifySecret(body.secret || "");
    const result = updateSubjectStatus(body);
    return jsonOutput({ ok: true, ...result });
  } catch (error) {
    return jsonOutput({ ok: false, error: String(error && error.message ? error.message : error) });
  }
}

function parseBody(e) {
  const text = e && e.postData && e.postData.contents ? e.postData.contents : "{}";
  return JSON.parse(text || "{}");
}

function verifySecret(secret) {
  const expected = PropertiesService.getScriptProperties().getProperty(SECRET_PROPERTY_NAME) || "";
  if (expected && String(secret || "") !== expected) {
    throw new Error("Secret does not match");
  }
}

function updateSubjectStatus(payload) {
  const spreadsheetId = extractSpreadsheetId(payload.sheetUrl || "");
  if (!spreadsheetId) throw new Error("Missing spreadsheet id");

  const statusType = cleanCell(payload.statusType || "");
  const nextStatus = canonicalStatus(payload.status || "");
  if (statusType !== "clip" && statusType !== "document") {
    throw new Error("Invalid status type");
  }
  if (!nextStatus) {
    throw new Error("Invalid status value. Use pending or done.");
  }

  const position = cleanCell(payload.position || "");
  const order = cleanCell(payload.order || "");
  const title = cleanCell(payload.title || "");
  if (!position || !order || !title) {
    throw new Error("Missing position/order/subject title");
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = sheetByGid(ss, payload.gid || DEFAULT_MANUAL_ENTRY_GID);
  if (!sheet) throw new Error("Target sheet gid not found");

  const values = sheet.getDataRange().getValues();
  const header = (values[0] || []).map(cleanCell);
  const positionIndex = columnIndex(header, POSITION_HEADERS);
  const orderIndex = columnIndex(header, ORDER_HEADERS);
  const subjectIndex = columnIndex(header, SUBJECT_HEADERS);
  const clipStatusIndex = columnIndex(header, CLIP_STATUS_HEADERS);
  const documentStatusIndex = columnIndex(header, DOCUMENT_STATUS_HEADERS);
  const latestUpdateIndex = ensureColumn(sheet, header, LATEST_UPDATE_HEADERS, TH_LATEST_UPDATE);
  const latestUpdateItemIndex = ensureColumn(sheet, header, LATEST_UPDATE_ITEM_HEADERS, TH_LATEST_UPDATE_ITEM);
  const updateHistoryIndex = ensureColumn(sheet, header, UPDATE_HISTORY_HEADERS, TH_UPDATE_HISTORY);

  if (positionIndex < 0 || orderIndex < 0 || subjectIndex < 0) {
    throw new Error("Missing position/order/subject columns");
  }

  const targetColumnIndex = statusType === "clip" ? clipStatusIndex : documentStatusIndex;
  if (targetColumnIndex < 0) {
    throw new Error(statusType === "clip" ? "Missing clip status column" : "Missing document status column");
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
      ? "No matching row found"
      : "Multiple matching rows found: " + matches.length);
  }

  const match = matches[0];
  const previousStatus = cleanCell(match.row[targetColumnIndex]);
  const updatedAt = new Date().toISOString();
  const latestUpdateItem = (statusType === "clip" ? TH_CLIP_LABEL : TH_DOCUMENT_LABEL) + ": " + nextStatus + " - " + title;
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
  const text = String(value || "");
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
  return String(value == null ? "" : value).replace(/^\uFEFF/u, "").trim();
}

function sameSheetKey(a, b) {
  return normalizeKey(a) === normalizeKey(b);
}

function normalizeKey(value) {
  return cleanCell(value).replace(/\s+/g, "").toLowerCase();
}

function canonicalStatus(value) {
  const raw = cleanCell(value);
  const fixed = repairMojibake(raw);
  const normalized = (raw + " " + fixed).toLowerCase().replace(/\s+/g, "");
  if (raw === TH_PENDING || fixed === TH_PENDING) return TH_PENDING;
  if (raw === TH_DONE || raw === TH_DONE_ALT || fixed === TH_DONE || fixed === TH_DONE_ALT) return TH_DONE;
  if (normalized.indexOf("\u0e22\u0e31\u0e07\u0e44\u0e21\u0e48") >= 0 || normalized.indexOf("\u0e44\u0e21\u0e48\u0e25\u0e07") >= 0 || normalized.indexOf("pending") >= 0) {
    return TH_PENDING;
  }
  if (normalized.indexOf("\u0e25\u0e07\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e41\u0e25\u0e49\u0e27") >= 0 || normalized.indexOf("\u0e25\u0e07\u0e25\u0e34\u0e07\u0e04\u0e4c\u0e41\u0e25\u0e49\u0e27") >= 0 || normalized.indexOf("\u0e25\u0e07\u0e41\u0e25\u0e49\u0e27") >= 0 || normalized.indexOf("done") >= 0 || normalized.indexOf("complete") >= 0) {
    return TH_DONE;
  }
  return "";
}

function repairMojibake(value) {
  const text = cleanCell(value);
  if (!text || (text.indexOf("\u00e0") < 0 && text.indexOf("\u00c3") < 0)) return text;
  try {
    const bytes = [];
    for (let i = 0; i < text.length; i++) {
      const code = text.charCodeAt(i);
      if (code <= 255) bytes.push(code);
    }
    if (!bytes.length) return text;
    return Utilities.newBlob(bytes).getDataAsString("UTF-8");
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
    const parts = line.split(" | ");
    return {
      at: parts[0] || "",
      status: parts[1] || "",
      title: parts.slice(2).join(" | ") || line
    };
  }).filter(entry => entry.title || entry.status || entry.at);
}

function buildUpdateHistoryValue(existingValue, nextEntry) {
  const existingEntries = parseUpdateHistoryEntries(existingValue)
    .filter(entry => entry && (entry.at || entry.title || entry.status));
  const entries = isDuplicateHistoryEntry(nextEntry, existingEntries[0])
    ? existingEntries
    : [nextEntry].concat(existingEntries);
  return JSON.stringify(entries.slice(0, 5));
}

function isDuplicateHistoryEntry(a, b) {
  if (!a || !b) return false;
  const sameCore =
    cleanCell(a.type) === cleanCell(b.type) &&
    cleanCell(a.status) === cleanCell(b.status) &&
    normalizeKey(a.title) === normalizeKey(b.title);
  if (!sameCore) return false;
  const firstTime = Date.parse(a.at || "");
  const secondTime = Date.parse(b.at || "");
  if (!isFinite(firstTime) || !isFinite(secondTime)) return true;
  return Math.abs(firstTime - secondTime) <= 15000;
}

function jsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}
