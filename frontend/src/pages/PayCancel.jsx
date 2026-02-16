import React from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function PayCancel() {
  const [params] = useSearchParams();
  const token = params.get("token");

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Payment Cancelled</h2>
      <p>The payment was cancelled or not completed.</p>

      {token ? (
        <Link to={`/invoice/${encodeURIComponent(token)}`}>Back to invoice</Link>
      ) : (
        <Link to="/">Go home</Link>
      )}
    </div>
  );
}
