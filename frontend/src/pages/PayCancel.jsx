import React from "react";
import { Link, useSearchParams } from "react-router-dom";

export default function PayCancel() {
  const [params] = useSearchParams();
  const token = params.get("token");

  return (
    <div className="utility_page">
      <div className="utility_page_content">
        <h2 style={{ marginTop: 0 }}>Payment Cancelled</h2>
        <p>The payment was cancelled or not completed.</p>

        {token ? (
          <Link to={`/invoice/${encodeURIComponent(token)}`} className="btn purple">Back to invoice</Link>
        ) : (
          <Link to="/" className="btn purple">Go home</Link>
        )}
      </div>
    </div>
  );
}
