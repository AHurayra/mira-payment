import "dotenv/config";
import express from "express";
import Stripe from "stripe";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";

import {
  readAllRows,
  findRowByPayToken,
  rowToObject,
  patchRow,
} from "./sheets.js";

const app = express();

// --------------------
// CORS (PRODUCTION SAFE)
// --------------------
const allowedOrigins = [
  "http://localhost:5173",
  "https://mira-payment.vercel.app",
  "https://pay.e-rxhub.com",
  "https://www.pay.e-rxhub.com",
  "https://e-rxhub.com",
  "https://www.e-rxhub.com",
];

app.use(
  cors({
    origin: function (origin, callback) {
      // allow non-browser tools (curl, stripe webhook)
      if (!origin) return callback(null, true);

      // allow exact matches
      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      // allow any subdomain of e-rxhub.com
      if (origin.endsWith(".e-rxhub.com")) {
        return callback(null, true);
      }

      console.error("CORS blocked origin:", origin);
      callback(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "stripe-signature"],
  })
);

// IMPORTANT: handle OPTIONS preflight
app.options("*", cors());


app.use(cookieParser());

/**
 * --------------------
 * Stripe Webhook (RAW)
 * MUST be BEFORE express.json()
 * --------------------
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// ✅ Stripe webhook FIRST (raw body)
// Stripe webhook FIRST
// --------------------
// Stripe Webhook
// --------------------
app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const sig = req.headers["stripe-signature"];

    let event;

    try {
      event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error("Webhook signature error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    try {
      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        let payToken = session?.metadata?.pay_token;

        // fallback: find by session id
        if (!payToken) {
          const { headers, dataRows } = await readAllRows();
          const list = dataRows.map((r) => rowToObject(headers, r));

          const match = list.find(
            (x) =>
              String(x.Stripe_Session_ID || "").trim() ===
              String(session.id || "").trim()
          );

          if (match) payToken = match.Pay_Token;
        }

        if (!payToken) {
          console.log("Webhook: payToken not found");
          return res.json({ received: true });
        }

        const found = await findRowByPayToken(payToken);

        if (!found) {
          console.log("Webhook: row not found for token:", payToken);
          return res.json({ received: true });
        }

        await patchRow(found.rowNumber, found.headers, {
          Payment_Status: "Paid",
          Stripe_Session_ID: session.id,
          Stripe_Payment_Intent: session.payment_intent || "",
          Paid_At: new Date().toISOString(),
        });

        console.log("Webhook: updated Payment_Status to Paid for", payToken);
      }

      return res.json({ received: true });

    } catch (err) {
      console.error("Webhook processing error:", err);
      return res.status(500).json({ error: err.message });
    }
  }
);


// express.json AFTER webhook
app.use(express.json());


app.get("/debug/sheet-write/:payToken", async (req, res) => {
  const payToken = req.params.payToken;

  const found = await findRowByPayToken(payToken);
  if (!found) return res.status(404).json({ error: "Not found in sheet" });

  await patchRow(found.rowNumber, found.headers, {
    Payment_Status: "Paid",
    Paid_At: new Date().toISOString(),
  });

  res.json({ ok: true, row: found.rowNumber });
});

/**
 * --------------------
 * Admin auth (cookie-based)
 * --------------------
 */
function signAdminToken() {
  const secret = process.env.ADMIN_SESSION_SECRET || "dev_secret";
  const payload = `admin|${Date.now()}`;
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

function verifyAdminToken(token) {
  if (!token || typeof token !== "string") return false;
  const secret = process.env.ADMIN_SESSION_SECRET || "dev_secret";
  const parts = token.split(".");
  if (parts.length !== 2) return false;

  const [payload, sig] = parts;
  const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.admin_session;
  if (!verifyAdminToken(token)) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// Admin login
app.post("/api/admin/login", (req, res) => {
  const password = String(req.body?.password || "");

  if (!process.env.ADMIN_PASSWORD) {
    return res.status(500).json({ error: "ADMIN_PASSWORD not set" });
  }

  if (password !== process.env.ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Invalid password" });
  }

  const token = signAdminToken();

  // Cross-site cookie (Vercel frontend + Railway backend)
  res.cookie("admin_session", token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });

  res.json({ ok: true });
});

// Admin logout
app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("admin_session", {
    httpOnly: true,
    sameSite: "none",
    secure: true,
  });

  res.json({ ok: true });
});

// Admin session check
app.get("/api/admin/me", (req, res) => {
  const ok = verifyAdminToken(req.cookies?.admin_session);
  res.json({ ok });
});

/**
 * --------------------
 * Public endpoints
 * --------------------
 */
app.get("/health", (req, res) => res.json({ ok: true }));

// Customer invoice by token
app.get("/api/invoice/:payToken", async (req, res) => {
  const found = await findRowByPayToken(req.params.payToken);
  if (!found) return res.status(404).json({ error: "Invoice not found" });

  const data = rowToObject(found.headers, found.row);
  res.json(data);
});

// Public search by token/email/phone/name
app.get("/api/search", async (req, res) => {
  const qRaw = String(req.query.q || "").trim();
  if (!qRaw) return res.status(400).json({ error: "Missing q" });

  const { headers, dataRows } = await readAllRows();
  const list = dataRows.map((r) => rowToObject(headers, r));

  function norm(s) {
    return String(s || "")
      .toLowerCase()
      .replace(/[,/._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function nameVariants(name) {
    const n = String(name || "").trim();
    const out = new Set();
    if (!n) return [];

    out.add(n);
    out.add(norm(n));

    if (n.includes(",")) {
      const parts = n.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const last = parts[0];
        const first = parts.slice(1).join(" ");
        out.add(`${first} ${last}`);
        out.add(norm(`${first} ${last}`));
      }
    }

    out.add(norm(n.replace(/,/g, " ")));
    return Array.from(out);
  }

  const needle = norm(qRaw);

  const exact = list.find((x) => norm(x.Pay_Token) === needle);
  if (exact) {
    return res.json({
      count: 1,
      results: [{
        Pay_Token: exact.Pay_Token,
        Payment_Status: exact.Payment_Status,
        Total_Price: exact.Total_Price,
        Patient_Name: exact.Patient_Name,
        Patient_Email: exact.Patient_Email,
        Phone: exact.Phone,
        Practice_Name: exact.Practice_Name,
        Rx_Number: exact.Rx_Number,
        Order_Number: exact.Order_Number,
      }],
    });
  }

  const matches = list.filter((x) => {
    const parts = [];
    parts.push(
      x.Pay_Token,
      x.Patient_Email,
      x.Phone,
      x.Practice_Name,
      x.Rx_Number,
      x.Order_Number
    );
    for (const v of nameVariants(x.Patient_Name)) parts.push(v);

    const hay = norm(parts.filter(Boolean).join(" "));
    return hay.includes(needle);
  });

  const trimmed = matches.slice(0, 10).map((x) => ({
    Pay_Token: x.Pay_Token,
    Payment_Status: x.Payment_Status,
    Total_Price: x.Total_Price,
    Patient_Name: x.Patient_Name,
    Patient_Email: x.Patient_Email,
    Phone: x.Phone,
    Practice_Name: x.Practice_Name,
    Rx_Number: x.Rx_Number,
    Order_Number: x.Order_Number,
  }));

  res.json({ count: trimmed.length, results: trimmed });
});

// Stripe pay now (customer)
app.post("/api/stripe/pay/:payToken", async (req, res) => {
  try {
    const { payToken } = req.params;

    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
    }

    const found = await findRowByPayToken(payToken);
    if (!found) return res.status(404).json({ error: "Invoice not found" });

    const data = rowToObject(found.headers, found.row);

    if (String(data.Payment_Status || "").toLowerCase() === "paid") {
      return res.status(400).json({ error: "Invoice already paid" });
    }

    const total = Number(data.Total_Price || 0);
    const amountCents = Math.round(total * 100);

    if (!Number.isFinite(amountCents) || amountCents < 50) {
      return res.status(400).json({ error: `Invalid Total_Price: ${data.Total_Price}` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd",
          unit_amount: amountCents,
          product_data: {
            name: `Invoice ${payToken}`,
            description: `${data.Patient_Name || ""} • ${data.Practice_Name || ""}`.trim(),
          },
        },
      }],
      success_url: `${process.env.CLIENT_SUCCESS_URL}?token=${encodeURIComponent(payToken)}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_CANCEL_URL}?token=${encodeURIComponent(payToken)}`,
      metadata: { pay_token: payToken },
    });

    await patchRow(found.rowNumber, found.headers, {
      Stripe_Session_ID: session.id,
    });

    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error("Stripe pay error:", err);
    res.status(500).json({
      error: err?.message || "Stripe error",
      type: err?.type,
      code: err?.code,
    });
  }
});

/**
 * --------------------
 * Admin endpoints
 * --------------------
 */
app.get("/api/invoices", requireAdmin, async (req, res) => {
  const { status } = req.query;

  const { headers, dataRows } = await readAllRows();
  const list = dataRows.map((r) => rowToObject(headers, r));

  const filtered = status
    ? list.filter((x) => String(x.Payment_Status || "").toLowerCase() === String(status).toLowerCase())
    : list;

  const dashboard = filtered.map((x) => ({
    Pay_Token: x.Pay_Token,
    Payment_Status: x.Payment_Status,
    Total_Price: x.Total_Price,
    Patient_Name: x.Patient_Name,
    Practice_Name: x.Practice_Name,
    Rx_Number: x.Rx_Number,
    Order_Number: x.Order_Number,
    Fill_Date: x.Fill_Date,
    Rx_Status: x.Rx_Status,
  }));

  res.json({ count: dashboard.length, invoices: dashboard });
});

app.patch("/api/invoice/:payToken/status", requireAdmin, async (req, res) => {
  const { payToken } = req.params;
  const status = String(req.body?.Payment_Status || "").trim();

  if (!["Paid", "Unpaid"].includes(status)) {
    return res.status(400).json({ error: 'Payment_Status must be "Paid" or "Unpaid"' });
  }

  const found = await findRowByPayToken(payToken);
  if (!found) return res.status(404).json({ error: "Invoice not found" });

  await patchRow(found.rowNumber, found.headers, { Payment_Status: status });
  res.json({ ok: true, Pay_Token: payToken, Payment_Status: status });
});

app.get("/api/summary", requireAdmin, async (req, res) => {
  const { headers, dataRows } = await readAllRows();
  const rows = dataRows.map((r) => rowToObject(headers, r));

  function num(v) {
    const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  const all = rows;
  const paid = rows.filter((x) => String(x.Payment_Status || "").toLowerCase() === "paid");
  const unpaid = rows.filter((x) => String(x.Payment_Status || "").toLowerCase() === "unpaid");

  const totalAmount = all.reduce((s, x) => s + num(x.Total_Price), 0);
  const paidAmount = paid.reduce((s, x) => s + num(x.Total_Price), 0);
  const unpaidAmount = unpaid.reduce((s, x) => s + num(x.Total_Price), 0);

  res.json({
    all: { count: all.length, amount: totalAmount },
    paid: { count: paid.length, amount: paidAmount },
    unpaid: { count: unpaid.length, amount: unpaidAmount },
  });
});

app.get("/api/customers", requireAdmin, async (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const status = String(req.query.status || "All").trim();
  const min = req.query.min !== undefined && req.query.min !== "" ? Number(req.query.min) : null;
  const max = req.query.max !== undefined && req.query.max !== "" ? Number(req.query.max) : null;

  const { headers, dataRows } = await readAllRows();
  const rows = dataRows.map((r) => rowToObject(headers, r));

  function num(v) {
    const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  }

  let filtered = rows;

  if (status !== "All") {
    const s = status.toLowerCase();
    filtered = filtered.filter((x) => String(x.Payment_Status || "").toLowerCase() === s);
  }

  if (min !== null && Number.isFinite(min)) {
    filtered = filtered.filter((x) => num(x.Total_Price) >= min);
  }
  if (max !== null && Number.isFinite(max)) {
    filtered = filtered.filter((x) => num(x.Total_Price) <= max);
  }

  if (q) {
    filtered = filtered.filter((x) => {
      const hay = [x.Patient_Name, x.Patient_Email, x.Pay_Token, x.Medication_Prescriber]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  const list = filtered.map((x) => ({
    Pay_Token: x.Pay_Token,
    Payment_Status: x.Payment_Status,
    Total_Price: x.Total_Price,
    Patient_Name: x.Patient_Name,
    Patient_Email: x.Patient_Email,
    Phone: x.Phone,
    Practice_Name: x.Practice_Name,
    Medication_Prescriber: x.Medication_Prescriber,
    Rx_Number: x.Rx_Number,
    Order_Number: x.Order_Number,
    Fill_Date: x.Fill_Date,
  }));

  res.json({ count: list.length, customers: list });
});

/**
 * --------------------
 * Error handler (prevents silent crashes)
 * --------------------
 */
app.use((err, req, res, next) => {
  console.error("Server error:", err);
  res.status(500).json({ error: err?.message || "Server error" });
});

/**
 * --------------------
 * Railway/VPS listen
 * MUST bind to 0.0.0.0
 * --------------------
 */
const PORT = process.env.PORT || 4242;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});

app.get("/debug/write/:payToken", async (req, res) => {
  const found = await findRowByPayToken(req.params.payToken);
  if (!found) return res.status(404).json({ error: "Not found" });

  await patchRow(found.rowNumber, found.headers, {
    Payment_Status: "Paid",
    Paid_At: new Date().toISOString(),
  });

  res.json({ ok: true });
});

if (event.type === "checkout.session.completed") {
  const session = event.data.object;

  // Try metadata first
  let payToken = session?.metadata?.pay_token;

  // Fallback: if metadata missing, find row by Stripe_Session_ID (session.id)
  if (!payToken) {
    const { headers, dataRows } = await readAllRows();
    const list = dataRows.map((r) => rowToObject(headers, r));

    const match = list.find(
      (x) => String(x.Stripe_Session_ID || "").trim() === String(session.id || "").trim()
    );

    if (match) payToken = match.Pay_Token;
  }

  if (!payToken) {
    console.log("Webhook: no payToken found for session", session?.id);
    return res.json({ received: true });
  }

  const found = await findRowByPayToken(payToken);
  if (!found) {
    console.log("Webhook: payToken not found in sheet:", payToken);
    return res.json({ received: true });
  }

  await patchRow(found.rowNumber, found.headers, {
    Payment_Status: "Paid",
    Stripe_Session_ID: session.id,
    Stripe_Payment_Intent: session.payment_intent || "",
    Paid_At: new Date().toISOString(),
  });

  console.log("Webhook: updated sheet to Paid for", payToken);
}
