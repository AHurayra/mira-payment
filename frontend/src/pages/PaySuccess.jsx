import React, { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet } from "../api.js";

export default function PaySuccess() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [inv, setInv] = useState(null);

  useEffect(() => {
    (async () => {
      if (!token) return;
      try {
        const data = await apiGet(`/api/invoice/${encodeURIComponent(token)}`);
        setInv(data);
      } catch {}
    })();
  }, [token]);

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Payment Success</h2>
      <p>Your payment was submitted to Stripe.</p>

      {token && (
        <p>
          Invoice token: <b>{token}</b>
        </p>
      )}

      {inv && (
        <p>
          Current status: <b>{inv.Payment_Status}</b>
        </p>
      )}

      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {token ? <Link to={`/invoice/${encodeURIComponent(token)}`}>Back to invoice</Link> : <Link to="/">Go home</Link>}
      </div>

      <p style={{ marginTop: 12, color: "#6b7280", fontSize: 13 }}>
        If status is still Unpaid, it means webhook auto-update isn’t connected yet (ngrok step).
      </p>
    </div>
  );
}
