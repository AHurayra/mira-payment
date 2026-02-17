import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet } from "../api.js";

export default function PaySuccess() {
  const [params] = useSearchParams();
  const token = params.get("token");

  const [inv, setInv] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    let timer = null;

    const isPaid = (status) =>
      String(status || "").trim().toLowerCase() === "paid";

    async function fetchInvoiceOnce() {
      setErr("");
      setLoading(true);
      try {
        // cache-buster so we don't get a cached response
        const data = await apiGet(
          `/api/invoice/${encodeURIComponent(token)}?t=${Date.now()}`
        );
        if (cancelled) return;
        setInv(data);
        return data;
      } catch (e) {
        if (cancelled) return;
        setErr(e?.message || "Failed to load invoice");
        return null;
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    async function poll() {
      // Try up to 10 times, every 2 seconds (about 20 seconds)
      for (let i = 0; i < 10; i++) {
        const data = await fetchInvoiceOnce();
        if (cancelled) return;

        if (data && isPaid(data.Payment_Status)) return;

        // wait 2 seconds before trying again
        await new Promise((r) => {
          timer = setTimeout(r, 2000);
        });
      }
    }

    poll();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [token]);

  const statusText = inv?.Payment_Status ?? "";

  return (
    <div className="utility_page">
      <div className="utility_page_content">
        <h2>Payment Success</h2>
        <p>Your payment was submitted to Stripe.</p>

        {token && (
          <p>
            Invoice token: <b>{token}</b>
          </p>
        )}

        {loading && <p>Checking latest status…</p>}

        {!!err && (
          <p style={{ color: "#ef4444" }}>
            {err}
          </p>
        )}

        {inv && (
          <p>
            Current status: <b>{statusText}</b>
          </p>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {token ? (
            <Link
              to={`/invoice/${encodeURIComponent(token)}`}
              className="btn purple"
            >
              Back to invoice
            </Link>
          ) : (
            <Link to="/" className="btn purple">
              Go home
            </Link>
          )}
        </div>

        <p style={{ marginTop: 12, color: "#6b7280", fontSize: 13 }}>
          If it stays Unpaid for 20+ seconds, your webhook probably didn’t update the Google Sheet row.
        </p>
      </div>
    </div>
  );
}
