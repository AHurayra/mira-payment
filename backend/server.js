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


// ======================================================
// CORS CONFIG
// ======================================================

const allowedOrigins = [
  "http://localhost:5173",
  "https://mira-payment.vercel.app",
  "https://pay.e-rxhub.com",
  "https://e-rxhub.com",
];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      return cb(new Error("CORS blocked: " + origin));
    },
    credentials: true,
  })
);

app.use(cookieParser());


// ======================================================
// STRIPE INIT
// ======================================================

if (!process.env.STRIPE_SECRET_KEY)
  throw new Error("Missing STRIPE_SECRET_KEY");

if (!process.env.STRIPE_WEBHOOK_SECRET)
  throw new Error("Missing STRIPE_WEBHOOK_SECRET");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);


// ======================================================
// STRIPE WEBHOOK (RAW BODY REQUIRED)
// ======================================================

app.post(
  "/webhook/stripe",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    try {
      const sig = req.headers["stripe-signature"];

      const event = stripe.webhooks.constructEvent(
        req.body,
        sig,
        process.env.STRIPE_WEBHOOK_SECRET
      );

      console.log("Stripe webhook event:", event.type);

      if (event.type === "checkout.session.completed") {
        const session = event.data.object;

        const payToken = session.metadata?.pay_token;

        console.log("Pay token:", payToken);

        if (payToken) {
          const found = await findRowByPayToken(payToken);

          if (found) {
            await patchRow(found.rowNumber, found.headers, {
              Payment_Status: "Paid",
              Stripe_Session_ID: session.id,
              Stripe_Payment_Intent:
                session.payment_intent || "",
              Paid_At: new Date().toISOString(),
            });

            console.log("Google Sheet updated: Paid");
          }
        }
      }

      return res.json({ received: true });

    } catch (err) {
      console.error("Webhook error:", err.message);
      return res.status(400).send(`Webhook Error: ${err.message}`);
    }
  }
);


// ======================================================
// JSON ROUTES
// ======================================================

app.use(express.json());


// ======================================================
// ADMIN AUTH
// ======================================================

function signAdminToken() {
  const secret = process.env.ADMIN_SESSION_SECRET;

  const payload = `admin|${Date.now()}`;

  const sig = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return `${payload}.${sig}`;
}

function verifyAdminToken(token) {
  if (!token) return false;

  const secret = process.env.ADMIN_SESSION_SECRET;

  const [payload, sig] = token.split(".");

  const expected = crypto
    .createHmac("sha256", secret)
    .update(payload)
    .digest("hex");

  return sig === expected;
}

function requireAdmin(req, res, next) {
  const token = req.cookies?.admin_session;

  if (!verifyAdminToken(token))
    return res.status(401).json({ error: "Unauthorized" });

  next();
}


// ======================================================
// ADMIN ROUTES
// ======================================================

app.post("/api/admin/login", (req, res) => {
  const password = req.body.password;

  if (password !== process.env.ADMIN_PASSWORD)
    return res.status(401).json({ error: "Invalid password" });

  const token = signAdminToken();

  res.cookie("admin_session", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.json({ ok: true });
});

app.get("/api/admin/me", (req, res) => {
  const ok = verifyAdminToken(req.cookies?.admin_session);
  res.json({ ok });
});

app.post("/api/admin/logout", (req, res) => {
  res.clearCookie("admin_session");
  res.json({ ok: true });
});


// ======================================================
// HEALTH CHECK
// ======================================================

app.get("/health", (req, res) => {
  res.json({ ok: true });
});


// ======================================================
// INVOICE GET
// ======================================================

app.get("/api/invoice/:payToken", async (req, res) => {

  const found = await findRowByPayToken(req.params.payToken);

  if (!found)
    return res.status(404).json({ error: "Invoice not found" });

  const data = rowToObject(found.headers, found.row);

  res.json(data);
});


// ======================================================
// SEARCH
// ======================================================

app.get("/api/search", async (req, res) => {

  const q = String(req.query.q || "").toLowerCase();

  const { headers, dataRows } = await readAllRows();

  const list = dataRows.map(r => rowToObject(headers, r));

  const results = list.filter(x =>
    Object.values(x).join(" ").toLowerCase().includes(q)
  );

  res.json({
    count: results.length,
    results: results.slice(0, 10),
  });
});


// ======================================================
// STRIPE CHECKOUT CREATE
// ======================================================

app.post("/api/stripe/pay/:payToken", async (req, res) => {

  const { payToken } = req.params;

  const found = await findRowByPayToken(payToken);

  if (!found)
    return res.status(404).json({ error: "Invoice not found" });

  const data = rowToObject(found.headers, found.row);

  if (data.Payment_Status === "Paid")
    return res.status(400).json({ error: "Already paid" });

  const amount = Math.round(Number(data.Total_Price) * 100);

  const session = await stripe.checkout.sessions.create({

    mode: "payment",

    line_items: [{
      price_data: {
        currency: "usd",
        product_data: {
          name: `Invoice ${payToken}`,
        },
        unit_amount: amount,
      },
      quantity: 1,
    }],

    success_url:
      `${process.env.CLIENT_SUCCESS_URL}?token=${payToken}`,

    cancel_url:
      `${process.env.CLIENT_CANCEL_URL}?token=${payToken}`,

    metadata: {
      pay_token: payToken,
    },
  });

  await patchRow(found.rowNumber, found.headers, {
    Stripe_Session_ID: session.id,
  });

  res.json({ url: session.url });
});


// ======================================================
// SUMMARY
// ======================================================

app.get("/api/summary", requireAdmin, async (req, res) => {

  const { headers, dataRows } = await readAllRows();

  const rows = dataRows.map(r => rowToObject(headers, r));

  const paid = rows.filter(x => x.Payment_Status === "Paid");

  const unpaid = rows.filter(x => x.Payment_Status === "Unpaid");

  res.json({
    all: rows.length,
    paid: paid.length,
    unpaid: unpaid.length,
  });
});


// ======================================================
// SERVER START
// ======================================================

const PORT = process.env.PORT || 8080;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
