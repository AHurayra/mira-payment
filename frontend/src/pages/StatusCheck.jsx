import React, { useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api.js";

function Badge({ status }) {
  const s = (status || "").toLowerCase();
  const bg = s === "paid" ? "#dcfce7" : s === "unpaid" ? "#fee2e2" : "#e5e7eb";
  const color = s === "paid" ? "#166534" : s === "unpaid" ? "#991b1b" : "#111827";
  return (
    <span style={{ padding: "4px 10px", borderRadius: 999, background: bg, color, fontSize: 12, fontWeight: 700 }}>
      {status || "Unknown"}
    </span>
  );
}

export default function StatusCheck() {
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [data, setData] = useState(null);

  async function search(e) {
    e?.preventDefault?.();
    const query = q.trim();
    if (!query) return;

    setLoading(true);
    setErr("");
    setData(null);

    try {
      const res = await apiGet(`/api/search?q=${encodeURIComponent(query)}`);
      setData(res);
    } catch (e2) {
      setErr(String(e2.message || e2));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 16, maxWidth: 1280, margin: "auto", marginTop: 48}}>
      <h2 style={{ marginTop: 0 }}>Check Invoice Status</h2>
      <p style={{ color: "#4b5563", marginTop: 6 }}>
        Enter <b>Pay Token</b>, <b>Email</b>, <b>Phone</b>, or <b>Name</b> to find your invoice.
      </p>

      <form onSubmit={search} style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 12 }}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Pay token / email / phone / name"
          style={{ flex: "1 1 320px", padding: 12, borderRadius: 48, backgroundColor: "rgba(255,255,255,.2)" }}
        />
        <button type="submit" disabled={loading} className="btn purple" style={{border: "none"}} >
          {loading ? "Searching..." : "Search"}
        </button>
      </form>

      {err && <p style={{ color: "crimson", marginTop: 12 }}>{err}</p>}

      {data && (
        <div style={{ marginTop: 14 }}>
          <p style={{ color: "#374151", margin: 0 }}>
            Found <b>{data.count}</b> result(s)
          </p>

          <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
            {(data.results || []).map((x) => (
              <div key={x.Pay_Token} style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontWeight: 800 }}>{x.Patient_Name || "-"}</div>
                    <div style={{ color: "#6b7280", fontSize: 13 }}>{x.Practice_Name || "-"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <Badge status={x.Payment_Status} />
                    <div style={{ fontWeight: 800 }}>${x.Total_Price || "-"}</div>
                  </div>
                </div>

                <div style={{ marginTop: 10, color: "#374151", fontSize: 14, lineHeight: 1.6 }}>
                  <div><b>Token:</b> {x.Pay_Token}</div>
                  {x.Patient_Email ? <div><b>Email:</b> {x.Patient_Email}</div> : null}
                  {x.Phone ? <div><b>Phone:</b> {x.Phone}</div> : null}
                  {x.Order_Number ? <div><b>Order:</b> {x.Order_Number}</div> : null}
                  {x.Rx_Number ? <div><b>Rx:</b> {x.Rx_Number}</div> : null}
                </div>

                <div style={{ marginTop: 10, display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <Link to={`/invoice/${encodeURIComponent(x.Pay_Token)}`} className="btn">
                    View Invoice
                  </Link>
                </div>
              </div>
            ))}
          </div>

          {data.count === 0 && (
            <p style={{ color: "#6b7280", marginTop: 10 }}>
              No matching invoice found. Check your spelling and try again.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
