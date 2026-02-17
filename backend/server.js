import "dotenv/config";
import express from "express";
import Stripe from "stripe";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";

import { readAllRows, findRowByPayToken, rowToObject, patchRow } from "./sheets.js";

const app = express();

/**
 * --------------------
 * CORS (PRODUCTION SAFE)
 * --------------------
 */
const allowedOrigins = [
  "http://localhost:5173",
  "https://mira-payment.vercel.app",
  "https://pay.e-rxhub.com",
  "https://www.pay.e-rxhub.com",
  "https://e-rxhub.com",
  "https://www.e-rxhub.com",
];

const corsOptions = {
  origin: (origin, cb) => {
    // allow non-browser tools (curl, Stripe webhooks)
    if (!origin) return cb(null, true);

    if (allowedOrigins.includes(origin)) return cb(null, true);

    // allow any subdomain of e-rxhub.com
    try {
      const host = new URL(origin).hostname;
      if (host === "e-rxhub.com" || host.endsWith(".e-rxhub.com")) return cb(null, true);
    } catch {}

    console.error("CORS blocked origin:", origin);
    return cb(null, false); // will block
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: ["Content-Type", "stripe-signature"],
};

app.use(cors(corsOptions));

// preflight (important)
app.options("*", cors(corsOptions));

app.use(cookieParser());

/**
 * --------------------
 * Stripe Webhook (RAW)
 * MUST be BEFORE express.json()
 * --------------------
 */
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

app.post("/webhook/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  const sig = req.headers["stripe-signature"];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // 1) Try metadata first
      let payToken = session?.metadata?.pay_token;

      // 2) Fallback: find row by Stripe_Session_ID
      if (!payToken) {
        const { headers, dataRows } = await readAllRows();
        const list = dataRows.map((r) => rowToObject(headers, r));
        const match = list.find(
          (x) => String(x.Stripe_Session_ID || "").trim() === String(session.id || "").trim()
        );
        if (match) payToken = match.Pay_Token;
      }

      if (!payToken) {
        console.log("Webhook: payToken not found for session:", session?.id);
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
});

/**
 * --------------------
 * JSON routes AFTER webhook
 * --------------------
 */
app.use(express.json());

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
  if (!verifyAdminToken(token)) return res.status(401).json({ error: "Unauthorized" });
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

  res.cookie("admin_session", token, {
    httpOnly: true,
    sameSite: "none",
    secure: true,
    maxAge: 1000 * 60 * 60 * 24 * 7,
  });

  res.json({ ok: true });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("admin_session", { httpOnly: true, sameSite: "none", secure: true });
  res.json({ ok: true });
});

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

app.get("/api/invoice/:payToken", async (req, res) => {
  const found = await findRowByPayToken(req.params.payToken);
  if (!found) return res.status(404).json({ error: "Invoice not found" });

  res.json(rowToObject(found.headers, found.row));
});

app.get("/api/search", async (req, res) => {
  const qRaw = String(req.query.q || "").trim();
  if (!qRaw) return res.status(400).json({ error: "Missing q" });

  const { headers, dataRows } = await readAllRows();
  const list = dataRows.map((r) => rowToObject(headers, r));

  const norm = (s) =>
    String(s || "")
      .toLowerCase()
      .replace(/[,/._-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const needle = norm(qRaw);

  const exact = list.find((x) => norm(x.Pay_Token) === needle);
  if (exact) {
    return res.json({
      count: 1,
      results: [
        {
          Pay_Token: exact.Pay_Token,
          Payment_Status: exact.Payment_Status,
          Total_Price: exact.Total_Price,
          Patient_Name: exact.Patient_Name,
          Patient_Email: exact.Patient_Email,
          Phone: exact.Phone,
          Practice_Name: exact.Practice_Name,
          Rx_Number: exact.Rx_Number,
          Order_Number: exact.Order_Number,
        },
      ],
    });
  }

  const matches = list.filter((x) => {
    const hay = norm(
      [
        x.Pay_Token,
        x.Patient_Email,
        x.Phone,
        x.Practice_Name,
        x.Rx_Number,
        x.Order_Number,
        x.Patient_Name,
      ]
        .filter(Boolean)
        .join(" ")
    );
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

// Stripe Pay Now
app.post("/api/stripe/pay/:payToken", async (req, res) => {
  try {
    const { payToken } = req.params;

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
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `Invoice ${payToken}`,
              description: `${data.Patient_Name || ""} • ${data.Practice_Name || ""}`.trim(),
            },
          },
        },
      ],
      success_url: `${process.env.CLIENT_SUCCESS_URL}?token=${encodeURIComponent(
        payToken
      )}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.CLIENT_CANCEL_URL}?token=${encodeURIComponent(payToken)}`,
      metadata: { pay_token: payToken },
    });

    // Store session id (for fallback matching)
    await patchRow(found.rowNumber, found.headers, { Stripe_Session_ID: session.id });

    res.json({ url: session.url, session_id: session.id });
  } catch (err) {
    console.error("Stripe pay error:", err);
    res.status(500).json({ error: err?.message || "Stripe error" });
  }
});

/**
 * --------------------
 * Admin endpoints
 * --------------------
 */
app.get("/api/invoices", requireAdmin, async (req, res) => {
  const { headers, dataRows } = await readAllRows();
  const list = dataRows.map((r) => rowToObject(headers, r));
  res.json({ count: list.length, invoices: list });
});

app.get("/api/summary", requireAdmin, async (req, res) => {
  const { headers, dataRows } = await readAllRows();
  const rows = dataRows.map((r) => rowToObject(headers, r));

  const num = (v) => {
    const n = Number(String(v ?? "").replace(/[^\d.]/g, ""));
    return Number.isFinite(n) ? n : 0;
  };

  const paid = rows.filter((x) => String(x.Payment_Status || "").toLowerCase() === "paid");
  const unpaid = rows.filter((x) => String(x.Payment_Status || "").toLowerCase() === "unpaid");

  res.json({
    all: { count: rows.length, amount: rows.reduce((s, x) => s + num(x.Total_Price), 0) },
    paid: { count: paid.length, amount: paid.reduce((s, x) => s + num(x.Total_Price), 0) },
    unpaid: { count: unpaid.length, amount: unpaid.reduce((s, x) => s + num(x.Total_Price), 0) },
  });
});

app.get("/api/customers", requireAdmin, async (req, res) => {
  const { headers, dataRows } = await readAllRows();
  const rows = dataRows.map((r) => rowToObject(headers, r));
  res.json({ count: rows.length, customers: rows });
});

/**
 * --------------------
 * Debug endpoint (optional)
 * --------------------
 */
app.get("/debug/sheet-write/:payToken", async (req, res) => {
  const found = await findRowByPayToken(req.params.payToken);
  if (!found) return res.status(404).json({ error: "Not found in sheet" });

  await patchRow(found.rowNumber, found.headers, {
    Payment_Status: "Paid",
    Paid_At: new Date().toISOString(),
  });

  res.json({ ok: true, row: found.rowNumber });
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
 * Listen
 * --------------------
 */
const PORT = process.env.PORT || 4242;
app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
