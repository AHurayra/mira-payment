import React, { useEffect, useMemo, useState } from "react";
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

export default function Dashboard() {
  const [statusFilter, setStatusFilter] = useState("All");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [invoices, setInvoices] = useState([]);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = statusFilter === "All" ? "" : `?status=${encodeURIComponent(statusFilter)}`;
      const data = await apiGet(`/api/invoices${qs}`);
      setInvoices(data.invoices || []);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return invoices;
    return invoices.filter((x) => {
      const hay = [x.Patient_Name, x.Practice_Name, x.Rx_Number, x.Order_Number, x.Pay_Token].join(" ").toLowerCase();
      return hay.includes(s);
    });
  }, [invoices, q]);

  return (
    <div>
      <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <span style={{ fontWeight: 700 }}>Status:</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option>All</option>
            <option>Unpaid</option>
            <option>Paid</option>
          </select>
        </div>

        <input
          placeholder="Search (patient, practice, rx, order, token)"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          style={{ flex: "1 1 320px", padding: 8 }}
        />

        <button onClick={load} style={{ padding: "8px 12px" }}>
          Refresh
        </button>
      </div>

      <div style={{ height: 12 }} />

      {loading && <p>Loading...</p>}
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      {!loading && !err && (
        <>
          <p style={{ marginTop: 0, color: "#374151" }}>
            Showing <b>{filtered.length}</b> invoice(s)
          </p>

          <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 10 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ background: "#f9fafb", textAlign: "left" }}>
                  <th style={{ padding: 10 }}>Patient</th>
                  <th style={{ padding: 10 }}>Practice</th>
                  <th style={{ padding: 10 }}>Total</th>
                  <th style={{ padding: 10 }}>Status</th>
                  <th style={{ padding: 10 }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((x) => (
                  <tr key={x.Pay_Token} style={{ borderTop: "1px solid #e5e7eb" }}>
                    <td style={{ padding: 10 }}>{x.Patient_Name || "-"}</td>
                    <td style={{ padding: 10 }}>{x.Practice_Name || "-"}</td>
                    <td style={{ padding: 10 }}>${x.Total_Price || "-"}</td>
                    <td style={{ padding: 10 }}>
                      <Badge status={x.Payment_Status} />
                    </td>
                    <td style={{ padding: 10 }}>
                      <Link to={`/invoice/${encodeURIComponent(x.Pay_Token)}`}>View</Link>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} style={{ padding: 12, color: "#6b7280" }}>
                      No invoices found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
