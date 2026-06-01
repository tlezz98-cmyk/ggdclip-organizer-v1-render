/**
 * Clip Organizer - Google Apps Script status writer
 *
 * วิธีใช้แบบย่อ:
 * 1) เปิด Google Sheet > Extensions > Apps Script
 * 2) วางโค้ดนี้ทั้งหมดใน Code.gs แล้วกด Save
 * 3) ไปที่ Project Settings > Script properties แล้วเพิ่ม
 *    ชื่อ: STATUS_WRITER_SECRET
 *    ค่า: ใส่รหัสลับอะไรก็ได้ เช่น clip-2026
 * 4) Deploy > New deployment > Web app
 *    Execute as: Me
 *    Who has access: Anyone
 * 5) Copy Web app URL ไปใส่ใน config.json ของแอพ
 */

const DEFAULT_MANUAL_ENTRY_GID = '2021660849';
const SECRET_PROPERTY_NAME = 'STATUS_WRITER_SECRET';

const CLIP_STATUS_HEADERS = [
  'สถานะลิงก์คลิป',
  'สถานะลิงค์คลิป',
  'สถานะลงก์คลิป',
  'สถานะลงค์คลิป',
  'สถานะคลิป',
  'สถานะ'
];

const DOCUMENT_STATUS_HEADERS = [
  'สถานะลิงก์เอกสาร',
  'สถานะลิงค์เอกสาร',
  'สถานะเอกสาร',
  'ลิงก์เอกสาร',
  'ลิงค์เอกสาร'
];

const LATEST_UPDATE_HEADERS = [
  'อัปเดตล่าสุด',
  'อัพเดตล่าสุด',
  'แก้ไขล่าสุด',
  'ล่าสุด'
];

const LATEST_UPDATE_ITEM_HEADERS = [
  'รายการอัปเดตล่าสุด',
  'รายการอัพเดตล่าสุด',
  'วิชาที่อัปเดตล่าสุด',
  'วิชาที่อัพเดตล่าสุด'
];

function doGet() {
  return jsonOutput({ ok: true, message: 'Clip Organizer status writer is ready' });
}

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
    throw new Error('secret ไม่ถูกต้อง');
  }
}

function updateSubjectStatus(payload) {
  const spreadsheetId = extractSpreadsheetId(payload.sheetUrl || '');
  if (!spreadsheetId) throw new Error('ไม่พบ spreadsheet id');

  const statusType = cleanCell(payload.statusType || '');
  const nextStatus = cleanCell(payload.status || '');
  if (statusType !== 'clip' && statusType !== 'document') {
    throw new Error('ประเภทสถานะไม่ถูกต้อง');
  }
  if (nextStatus !== 'ยังไม่ลงลิงก์' && nextStatus !== 'ลงลิงก์แล้ว') {
    throw new Error('สถานะต้องเป็น ยังไม่ลงลิงก์ หรือ ลงลิงก์แล้ว เท่านั้น');
  }

  const position = cleanCell(payload.position || '');
  const order = cleanCell(payload.order || '');
  const title = cleanCell(payload.title || '');
  if (!position || !order || !title) {
    throw new Error('ข้อมูลตำแหน่ง/ลำดับ/ชื่อวิชาไม่ครบ');
  }

  const ss = SpreadsheetApp.openById(spreadsheetId);
  const sheet = sheetByGid(ss, payload.gid || DEFAULT_MANUAL_ENTRY_GID);
  if (!sheet) throw new Error('ไม่พบแท็บชีต gid ' + (payload.gid || DEFAULT_MANUAL_ENTRY_GID));

  const values = sheet.getDataRange().getValues();
  if (!values.length) throw new Error('ชีตไม่มีข้อมูล');
  const header = values[0].map(cleanCell);

  const positionIndex = columnIndex(header, ['ตำแหน่ง']);
  const orderIndex = columnIndex(header, ['ลำดับ']);
  const subjectIndex = columnIndex(header, ['ชื่อวิชา/หัวข้อ']);
  const clipStatusIndex = columnIndex(header, CLIP_STATUS_HEADERS);
  const documentStatusIndex = columnIndex(header, DOCUMENT_STATUS_HEADERS);
  const latestUpdateIndex = ensureColumn(sheet, header, LATEST_UPDATE_HEADERS, 'อัปเดตล่าสุด');
  const latestUpdateItemIndex = ensureColumn(sheet, header, LATEST_UPDATE_ITEM_HEADERS, 'รายการอัปเดตล่าสุด');
  const targetColumnIndex = statusType === 'clip' ? clipStatusIndex : documentStatusIndex;

  if (positionIndex < 0 || orderIndex < 0 || subjectIndex < 0) {
    throw new Error('ไม่พบคอลัมน์ ตำแหน่ง/ลำดับ/ชื่อวิชา ในชีต');
  }
  if (targetColumnIndex < 0) {
    throw new Error(statusType === 'clip'
      ? 'ไม่พบคอลัมน์สถานะลิงก์คลิปในชีต'
      : 'ไม่พบคอลัมน์สถานะเอกสารในชีต');
  }

  const matches = [];
  for (let i = 1; i < values.length; i += 1) {
    const row = values[i];
    if (sameSheetKey(row[positionIndex], position) &&
        sameSheetKey(row[orderIndex], order) &&
        sameSheetKey(row[subjectIndex], title)) {
      matches.push({ row, rowNumber: i + 1 });
    }
  }

  if (matches.length !== 1) {
    throw new Error(matches.length === 0
      ? 'ไม่พบแถวที่ตรงกับตำแหน่ง/ลำดับ/ชื่อวิชานี้'
      : 'พบหลายแถวที่ตรงกัน (' + matches.length + ' แถว) จึงยังไม่เขียนเพื่อกันผิดแถว');
  }

  const match = matches[0];
  const previousStatus = cleanCell(match.row[targetColumnIndex]);
  const updatedAt = new Date().toISOString();
  const latestUpdateItem = (statusType === 'clip' ? 'ลิงก์คลิป' : 'ลิงก์เอกสาร') + ': ' + nextStatus + ' · ' + title;
  sheet.getRange(match.rowNumber, targetColumnIndex + 1).setValue(nextStatus);
  sheet.getRange(match.rowNumber, latestUpdateIndex + 1).setValue(updatedAt);
  sheet.getRange(match.rowNumber, latestUpdateItemIndex + 1).setValue(latestUpdateItem);
  SpreadsheetApp.flush();

  return {
    spreadsheetId,
    gid: String(sheet.getSheetId()),
    sheetName: sheet.getName(),
    rowNumber: match.rowNumber,
    columnIndex: targetColumnIndex,
    statusType,
    previousStatus,
    status: nextStatus,
    updatedAt,
    latestUpdateItem,
    updatedCells: 3
  };
}

function jsonOutput(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
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
  return cleanCell(value)
    .replace(/[\u200B-\u200D\uFEFF]/g, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
