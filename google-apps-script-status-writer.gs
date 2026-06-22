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
const TH_GROUP = "\u0e01\u0e25\u0e38\u0e48\u0e21";
const TH_REUSABLE = "\u0e43\u0e0a\u0e49\u0e2a\u0e2d\u0e19\u0e44\u0e14\u0e49\u0e2b\u0e25\u0e32\u0e22\u0e01\u0e25\u0e38\u0e48\u0e21";
const TH_LINK_POST_GROUP = "\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e42\u0e1e\u0e2a\u0e15\u0e4c/\u0e01\u0e25\u0e38\u0e48\u0e21";
const TH_LINK_GROUP = "\u0e25\u0e34\u0e07\u0e01\u0e4c\u0e01\u0e25\u0e38\u0e48\u0e21";
const TH_NOTE = "\u0e2b\u0e21\u0e32\u0e22\u0e40\u0e2b\u0e15\u0e38";
const TH_CLIP_STATUS = "\u0e25\u0e07\u0e04\u0e25\u0e34\u0e1b";
const TH_SUBJECT_INSERT = "\u0e41\u0e17\u0e23\u0e01\u0e27\u0e34\u0e0a\u0e32";
const TH_SUBJECT_RENAME = "\u0e41\u0e01\u0e49\u0e0a\u0e37\u0e48\u0e2d\u0e27\u0e34\u0e0a\u0e32";
const TH_SUBJECT_DELETE = "\u0e25\u0e1a\u0e27\u0e34\u0e0a\u0e32";

const POSITION_HEADERS = [TH_POSITION];
const ORDER_HEADERS = [TH_ORDER];
const GROUP_HEADERS = [TH_GROUP];
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
const REUSABLE_HEADERS = [TH_REUSABLE];
const LINK_HEADERS = [TH_LINK_POST_GROUP, TH_LINK_GROUP, "Facebook"];
const NOTE_HEADERS = [TH_NOTE];
const CLIP_POST_STATUS_HEADERS = [TH_CLIP_STATUS];

function doPost(e) {
  try {
    const body = parseBody(e);
    verifySecret(body.secret || "");
    const action = cleanCell(body.action || "");
    const result = action === "rename" || action === "insert" || action === "delete"
      ? updateSubjectCatalog(body)
      : updateSubjectStatus(body);
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

function updateSubjectCatalog(payload) {
  const spreadsheetId = extractSpreadsheetId(payload.sheetUrl || "");
  if (!spreadsheetId) throw new Error("Missing spreadsheet id");

  const action = cleanCell(payload.action || "");
  if (action !== "rename" && action !== "insert" && action !== "delete") {
    throw new Error("Invalid subject catalog action");
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = sheetByGid(ss, payload.gid || DEFAULT_MANUAL_ENTRY_GID);
  if (!sheet) throw new Error("Target sheet gid not found");

  const values = sheet.getDataRange().getValues();
  const header = (values[0] || []).map(cleanCell);
  const indexes = subjectSheetIndexes(header);
  if (indexes.positionIndex < 0 || indexes.orderIndex < 0 || indexes.subjectIndex < 0) {
    throw new Error("Missing position/order/subject columns");
  }
  indexes.latestUpdateIndex = ensureColumn(sheet, header, LATEST_UPDATE_HEADERS, TH_LATEST_UPDATE);
  indexes.latestUpdateItemIndex = ensureColumn(sheet, header, LATEST_UPDATE_ITEM_HEADERS, TH_LATEST_UPDATE_ITEM);
  indexes.updateHistoryIndex = ensureColumn(sheet, header, UPDATE_HISTORY_HEADERS, TH_UPDATE_HISTORY);

  const updatedAt = new Date().toISOString();

  if (action === "rename") {
    const newTitle = cleanCell(payload.newTitle || "");
    if (!newTitle) throw new Error("Missing new subject title");
    const match = findUniqueSubjectRow(values, indexes, payload);
    const previousTitle = cleanCell(match.row[indexes.subjectIndex]);
    if (sameSheetKey(previousTitle, newTitle)) throw new Error("New subject title is unchanged");

    const latestUpdateItem = TH_SUBJECT_RENAME + ": " + previousTitle + " -> " + newTitle;
    const updateHistory = buildUpdateHistoryValue(match.row[indexes.updateHistoryIndex], {
      at: updatedAt,
      type: "subject-rename",
      status: cleanCell(payload.order || match.row[indexes.orderIndex]),
      title: previousTitle + " -> " + newTitle
    });

    sheet.getRange(match.rowNumber, indexes.subjectIndex + 1).setValue(newTitle);
    sheet.getRange(match.rowNumber, indexes.latestUpdateIndex + 1).setValue(updatedAt);
    sheet.getRange(match.rowNumber, indexes.latestUpdateItemIndex + 1).setValue(latestUpdateItem);
    sheet.getRange(match.rowNumber, indexes.updateHistoryIndex + 1).setValue(updateHistory);
    SpreadsheetApp.flush();

    return {
      action,
      spreadsheetId,
      sheetName: sheet.getName(),
      rowNumber: match.rowNumber,
      position: cleanCell(payload.position || match.row[indexes.positionIndex]),
      order: cleanCell(payload.order || match.row[indexes.orderIndex]),
      previousTitle,
      title: newTitle,
      updatedAt,
      updatedCells: 4
    };
  }

  if (action === "delete") {
    const match = findUniqueSubjectRow(values, indexes, payload);
    const position = cleanCell(payload.position || match.row[indexes.positionIndex]);
    const deletedOrder = parseSubjectOrder(payload.order || match.row[indexes.orderIndex]);
    if (!position || !isFinite(deletedOrder)) throw new Error("Missing position/order for delete");

    const previousTitle = cleanCell(match.row[indexes.subjectIndex]);
    const shiftedRows = subjectRowsForPosition(values, indexes, position)
      .filter(item => isFinite(item.orderNumber) && item.orderNumber > deletedOrder)
      .sort((a, b) => a.rowNumber - b.rowNumber);

    sheet.deleteRow(match.rowNumber);
    shiftedRows.forEach(item => {
      const rowNumber = item.rowNumber > match.rowNumber ? item.rowNumber - 1 : item.rowNumber;
      sheet.getRange(rowNumber, indexes.orderIndex + 1).setValue(String(item.orderNumber - 1));
    });
    SpreadsheetApp.flush();

    return {
      action,
      spreadsheetId,
      sheetName: sheet.getName(),
      rowNumber: match.rowNumber,
      position,
      order: String(deletedOrder),
      previousTitle,
      title: previousTitle,
      shiftedCount: shiftedRows.length,
      shiftedFromOrder: String(deletedOrder + 1),
      updatedAt,
      updatedCells: shiftedRows.length
    };
  }

  const position = cleanCell(payload.position || "");
  const title = cleanCell(payload.title || payload.newTitle || "");
  const insertOrder = parseSubjectOrder(payload.insertOrder || payload.order || "");
  if (!position) throw new Error("Missing position for insert");
  if (!title) throw new Error("Missing subject title for insert");
  if (!isFinite(insertOrder) || insertOrder < 1) throw new Error("Invalid insert order");

  const positionRows = subjectRowsForPosition(values, indexes, position);
  if (!positionRows.length) throw new Error("No subject rows found for this position");
  const duplicateAtOrder = positionRows.find(item =>
    Number(item.orderNumber) === Number(insertOrder) &&
    sameSheetKey(item.title, title)
  );
  if (duplicateAtOrder) throw new Error("Subject already exists at this order");

  const shiftedRows = positionRows
    .filter(item => isFinite(item.orderNumber) && item.orderNumber >= insertOrder)
    .sort((a, b) => a.rowNumber - b.rowNumber);
  const sortedPositionRows = positionRows.slice().sort((a, b) => a.rowNumber - b.rowNumber);
  const lastPositionRow = sortedPositionRows[sortedPositionRows.length - 1];
  let insertRowNumber = shiftedRows.length ? shiftedRows[0].rowNumber : lastPositionRow.rowNumber + 1;
  const templateRow = shiftedRows.length ? shiftedRows[0].row : lastPositionRow.row;

  if (shiftedRows.length) {
    sheet.insertRowsBefore(insertRowNumber, 1);
  } else {
    sheet.insertRowsAfter(lastPositionRow.rowNumber, 1);
    insertRowNumber = lastPositionRow.rowNumber + 1;
  }

  const insertedRow = buildInsertedSubjectRow(header.length, indexes, templateRow, position, insertOrder, title, updatedAt);
  sheet.getRange(insertRowNumber, 1, 1, header.length).setValues([insertedRow]);
  shiftedRows.forEach(item => {
    sheet.getRange(item.rowNumber + 1, indexes.orderIndex + 1).setValue(String(item.orderNumber + 1));
  });
  SpreadsheetApp.flush();

  return {
    action,
    spreadsheetId,
    sheetName: sheet.getName(),
    rowNumber: insertRowNumber,
    position,
    order: String(insertOrder),
    title,
    shiftedCount: shiftedRows.length,
    shiftedFromOrder: String(insertOrder),
    updatedAt,
    updatedCells: header.length + shiftedRows.length
  };
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
  const requestedRowNumber = Number(payload.rowNumber || 0);
  if (!position || !title || (!order && !requestedRowNumber)) {
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

  let matches = [];
  if (requestedRowNumber >= 2 && requestedRowNumber <= values.length && Math.floor(requestedRowNumber) === requestedRowNumber) {
    const row = values[requestedRowNumber - 1] || [];
    if (
      sameSheetKey(row[positionIndex], position) &&
      sameSheetKey(row[subjectIndex], title)
    ) {
      matches = [{ rowNumber: requestedRowNumber, row }];
    }
  }
  if (!matches.length) {
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

function subjectSheetIndexes(header) {
  return {
    positionIndex: columnIndex(header, POSITION_HEADERS),
    groupIndex: columnIndex(header, GROUP_HEADERS),
    orderIndex: columnIndex(header, ORDER_HEADERS),
    subjectIndex: columnIndex(header, SUBJECT_HEADERS),
    statusIndex: columnIndex(header, CLIP_STATUS_HEADERS),
    documentStatusIndex: columnIndex(header, DOCUMENT_STATUS_HEADERS),
    latestUpdateIndex: columnIndex(header, LATEST_UPDATE_HEADERS),
    latestUpdateItemIndex: columnIndex(header, LATEST_UPDATE_ITEM_HEADERS),
    updateHistoryIndex: columnIndex(header, UPDATE_HISTORY_HEADERS),
    reusableIndex: columnIndex(header, REUSABLE_HEADERS),
    linkIndex: columnIndex(header, LINK_HEADERS),
    noteIndex: columnIndex(header, NOTE_HEADERS),
    clipStatusIndex: columnIndex(header, CLIP_POST_STATUS_HEADERS)
  };
}

function parseSubjectOrder(value) {
  const match = String(value || "").replace(/,/g, "").match(/-?\d+(?:\.\d+)?/);
  if (!match) return NaN;
  const number = Number(match[0]);
  return isFinite(number) ? number : NaN;
}

function subjectRowsForPosition(values, indexes, position) {
  const rows = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    const title = cleanCell(row[indexes.subjectIndex]);
    if (sameSheetKey(row[indexes.positionIndex], position) && title) {
      rows.push({
        row,
        rowNumber: i + 1,
        order: cleanCell(row[indexes.orderIndex]),
        orderNumber: parseSubjectOrder(row[indexes.orderIndex]),
        title
      });
    }
  }
  return rows;
}

function findUniqueSubjectRow(values, indexes, payload) {
  const position = cleanCell(payload.position || "");
  const order = cleanCell(payload.order || "");
  const title = cleanCell(payload.title || "");
  const requestedRowNumber = Number(payload.rowNumber || 0);

  if (requestedRowNumber >= 2 && requestedRowNumber <= values.length && Math.floor(requestedRowNumber) === requestedRowNumber) {
    const row = values[requestedRowNumber - 1] || [];
    if (
      sameSheetKey(row[indexes.positionIndex], position) &&
      sameSheetKey(row[indexes.subjectIndex], title) &&
      (!order || sameSheetKey(row[indexes.orderIndex], order))
    ) {
      return { rowNumber: requestedRowNumber, row };
    }
  }

  const matches = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i] || [];
    if (
      sameSheetKey(row[indexes.positionIndex], position) &&
      sameSheetKey(row[indexes.orderIndex], order) &&
      sameSheetKey(row[indexes.subjectIndex], title)
    ) {
      matches.push({ rowNumber: i + 1, row });
    }
  }

  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? "No matching subject row found"
      : "Multiple matching subject rows found: " + matches.length);
  }
  return matches[0];
}

function buildInsertedSubjectRow(headerLength, indexes, templateRow, position, order, title, updatedAt) {
  const row = [];
  for (let i = 0; i < headerLength; i++) row.push("");
  if (indexes.positionIndex >= 0) row[indexes.positionIndex] = position;
  if (indexes.groupIndex >= 0) row[indexes.groupIndex] = cleanCell(templateRow && templateRow[indexes.groupIndex]);
  if (indexes.orderIndex >= 0) row[indexes.orderIndex] = String(order);
  if (indexes.subjectIndex >= 0) row[indexes.subjectIndex] = title;
  if (indexes.statusIndex >= 0) row[indexes.statusIndex] = TH_PENDING;
  if (indexes.documentStatusIndex >= 0) row[indexes.documentStatusIndex] = TH_PENDING;
  if (indexes.reusableIndex >= 0) row[indexes.reusableIndex] = cleanCell(templateRow && templateRow[indexes.reusableIndex]);
  if (indexes.linkIndex >= 0) row[indexes.linkIndex] = cleanCell(templateRow && templateRow[indexes.linkIndex]);
  if (indexes.latestUpdateIndex >= 0) row[indexes.latestUpdateIndex] = updatedAt;
  if (indexes.latestUpdateItemIndex >= 0) row[indexes.latestUpdateItemIndex] = TH_SUBJECT_INSERT + ": " + title;
  if (indexes.updateHistoryIndex >= 0) {
    row[indexes.updateHistoryIndex] = buildUpdateHistoryValue("", {
      at: updatedAt,
      type: "subject-insert",
      status: TH_ORDER + " " + order,
      title
    });
  }
  return row;
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
