import "dotenv/config";
import { google } from "googleapis";

// ====== CONFIG (set these in Railway Variables) ======
const SPREADSHEET_ID = process.env.SPREADSHEET_ID; // required
const SHEET_NAME = process.env.SHEET_NAME || "Sheet1"; // optional
const HEADER_ROW = Number(process.env.HEADER_ROW || 1); // 1 means first row is headers

// Accept credentials from any of these env vars:
function getServiceAccountCreds() {
  const raw =
    process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS_B64 ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!raw) {
    throw new Error(
      "Missing Google credentials. Set GOOGLE_APPLICATION_CREDENTIALS_JSON (recommended) in Railway."
    );
  }

  // If they provided base64
  if (raw.trim().startsWith("eyJ") || raw.includes("=")) {
    // might be base64 JSON; try decode safely
    try {
      const json = Buffer.from(raw, "base64").toString("utf8");
      if (json.trim().startsWith("{")) return JSON.parse(json);
    } catch {}
  }

  // If they pasted JSON directly
  if (raw.trim().startsWith("{")) {
    return JSON.parse(raw);
  }

  // Otherwise treat as file path (local dev)
  return null;
}

async function getSheetsClient() {
  const scopes = ["https://www.googleapis.com/auth/spreadsheets"];

  const creds = getServiceAccountCreds();

  let auth;
  if (creds) {
    // Use in-memory credentials (Railway safe)
    auth = new google.auth.GoogleAuth({ credentials: creds, scopes });
  } else {
    // Fallback: file path (local dev)
    auth = new google.auth.GoogleAuth({
      keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
      scopes,
    });
  }

  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

function ensureConfig() {
  if (!SPREADSHEET_ID) throw new Error("Missing SPREADSHEET_ID env var.");
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

// Reads headers + all data rows
export async function readAllRows() {
  ensureConfig();
  const sheets = await getSheetsClient();

  // Get all values in the sheet
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

// Find a row by Pay_Token
export async function findRowByPayToken(payToken) {
  const token = String(payToken || "").trim();
  if (!token) return null;

  const { headers, dataRows } = await readAllRows();
  const idx = headers.findIndex((h) => String(h).trim() === "Pay_Token");
  if (idx === -1) throw new Error('Column "Pay_Token" not found in header row.');

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if (String(row[idx] || "").trim() === token) {
      // Actual sheet row number = header row + 1 + i
      const rowNumber = HEADER_ROW + 1 + i;
      return { headers, row, rowNumber };
    }
  }

  return null;
}

// Patch a row by column names
export async function patchRow(rowNumber, headers, patch) {
  ensureConfig();
  const sheets = await getSheetsClient();

  // Read the full row first so we can update specific columns only
  const getResp = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: a1(`A${rowNumber}:ZZ${rowNumber}`),
  });

  const row = (getResp.data.values && getResp.data.values[0]) ? getResp.data.values[0] : [];
  const updated = [...row];

  for (const [key, value] of Object.entries(patch || {})) {
    const colIndex = headers.findIndex((h) => String(h).trim() === key);
    if (colIndex === -1) continue; // ignore missing columns
    updated[colIndex] = value ?? "";
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: a1(`A${rowNumber}:ZZ${rowNumber}`),
    valueInputOption: "RAW",
    requestBody: { values: [updated] },
  });
}
