import { google } from "googleapis";

function getAuth() {
  return new google.auth.GoogleAuth({
    keyFile: process.env.GOOGLE_APPLICATION_CREDENTIALS,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

async function getSheetsClient() {
  const auth = getAuth();
  const client = await auth.getClient();
  return google.sheets({ version: "v4", auth: client });
}

export async function readAllRows() {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const tab = process.env.GOOGLE_SHEETS_TAB_NAME;

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A1:Z`,
  });

  const rows = res.data.values || [];
  if (rows.length < 1) return { headers: [], dataRows: [] };

  return { headers: rows[0], dataRows: rows.slice(1) };
}

export async function findRowByPayToken(payToken) {
  const { headers, dataRows } = await readAllRows();

  const tokenIdx = headers.indexOf("Pay_Token");
  if (tokenIdx === -1) throw new Error("Missing column: Pay_Token");

  for (let i = 0; i < dataRows.length; i++) {
    const row = dataRows[i];
    if ((row[tokenIdx] || "").trim() === payToken.trim()) {
      return { rowNumber: i + 2, headers, row };
    }
  }
  return null;
}

export function rowToObject(headers, row) {
  const obj = {};
  headers.forEach((h, i) => (obj[h] = row[i] ?? ""));
  return obj;
}

export async function patchRow(rowNumber, headers, patch) {
  const sheets = await getSheetsClient();
  const spreadsheetId = process.env.GOOGLE_SHEETS_SPREADSHEET_ID;
  const tab = process.env.GOOGLE_SHEETS_TAB_NAME;

  const rowRes = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${tab}!A${rowNumber}:Z${rowNumber}`,
  });

  const current = (rowRes.data.values && rowRes.data.values[0]) || [];
  const updated = [...current];

  for (const [key, value] of Object.entries(patch)) {
    const idx = headers.indexOf(key);
    if (idx === -1) continue;
    updated[idx] = String(value ?? "");
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId,
    range: `${tab}!A${rowNumber}:Z${rowNumber}`,
    valueInputOption: "RAW",
    requestBody: { values: [updated] },
  });
}
