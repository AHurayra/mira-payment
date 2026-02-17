import "dotenv/config";
import { google } from "googleapis";

const SPREADSHEET_ID = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
const SHEET_NAME = process.env.GOOGLE_SHEETS_TAB_NAME || "Sheet1";
const HEADER_ROW = Number(process.env.HEADER_ROW || 1);

function getCredsFromEnv() {
  const raw = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!raw) {
    throw new Error("Missing GOOGLE_APPLICATION_CREDENTIALS (service account JSON).");
  }

  // If pasted JSON directly
  if (raw.trim().startsWith("{")) {
    return JSON.parse(raw);
  }

  // If they used base64 by mistake
  try {
    const decoded = Buffer.from(raw, "base64").toString("utf8");
    if (decoded.trim().startsWith("{")) return JSON.parse(decoded);
  } catch {}

  // Otherwise: treat as file path (local dev)
  return null;
}

async function getSheetsClient() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];
  const creds = getCredsFromEnv();

  let auth;
  if (creds) {
    auth = new google.auth.GoogleAuth({ credentials: creds, scopes });
  } else {
    // local dev path support
    auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes,
    });
  }

  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

function ensureConfig() {
  if (!SPREADSHEET_ID) throw new Error("Missing GOOGLE_SHEETS_SPREADSHEET_ID.");
  if (!SHEET_NAME) throw new Error("Missing GOOGLE_SHEETS_TAB_NAME.");
}

export function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((h, i) => {
    obj[String(h || "").trim()] = row[i] ?? "";
  });
  return obj;
}

function a1(range) {
  return `${SHEET_NAME}!${range}`;
}

export async function readAllRows() {
  ensureConfig();
  const sheets = await getSheetsClient();

  const resp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: a1("A:ZZ"),
  });

  const values = resp.data.values || [];
  const headerIndex = HEADER_ROW - 1;

  const headers = values[headerIndex] || [];
  const dataRows = values.slice(headerIndex + 1);

  return { headers, dataRows };
}

export async function findRowByPayToken(payToken) {
  const token = String(payToken || "").trim();
  if (!token) return null;

  const { headers, dataRows } = await readAllRows();

  const idx = headers.findIndex((h) => String(h).trim() === "Pay_Token");
  if (idx === -1) throw new Error('Column "Pay_Token" not found in header row.');

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (String(row[idx] || "").trim() === token) {
      const rowNumber = HEADER_ROW + 1 + i;
      return { headers, row, rowNumber };
    }
  }

  return null;
}

export async function patchRow(rowNumber, headers, patch) {
  ensureConfig();
  const sheets = await getSheetsClient();

  const getResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: a1(`A${rowNumber}:ZZ${rowNumber}`),
  });

  const row =
    getResp.data.values && getResp.data.values[0] ? getResp.data.values[0] : [];
  const updated = [...row];

  for (const [key, value] of Object.entries(patch || {})) {
    const colIndex = headers.findIndex((h) => String(h).trim() === key);
    if (colIndex === -1) continue;
    updated[colIndex] = value ?? "";
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: a1(`A${rowNumber}:ZZ${rowNumber}`),
    valueInputOption: "RAW",
    requestBody: { values: [updated] },
  });
}


if (colIndex === -1) throw new Error(`Column "${key}" not found`);
