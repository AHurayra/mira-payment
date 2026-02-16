import React, { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { apiGet } from "../api.js";
import { money } from "../utils/money.js";

function Badge({ status }) {
  const s = (status || "").toLowerCase();
  const bg = s === "paid" ? "#dcfce7" : s === "unpaid" ? "#fee2e2" : "#e5e7eb";
  const color = s === "paid" ? "#166534" : s === "unpaid" ? "#991b1b" : "#111827";
  return (
    <span style={{ padding: "4px 10px", borderRadius: 999, background: bg, color, fontSize: 12, fontWeight: 800 }}>
      {status || "Unknown"}
    </span>
  );
}

// ✅ small debounce hook
function useDebouncedValue(value, delayMs = 350) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(t);
  }, [value, delayMs]);

  return debounced;
}

export default function Customers() {
  const [params] = useSearchParams();
  const initialStatus = params.get("status") || "All";

  const [q, setQ] = useState("");
  const [status, setStatus] = useState(initialStatus);
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");

  const debouncedQ = useDebouncedValue(q, 350);
  const debouncedMin = useDebouncedValue(min, 350);
  const debouncedMax = useDebouncedValue(max, 350);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState("");
  const [rows, setRows] = useState([]);

  // ✅ auto load whenever filters change
  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setErr("");

      const qs = new URLSearchParams();
      if (debouncedQ.trim()) qs.set("q", debouncedQ.trim());
      if (status) qs.set("status", status);
      if (debouncedMin !== "") qs.set("min", debouncedMin);
      if (debouncedMax !== "") qs.set("max", debouncedMax);

      try {
        const data = await apiGet(`/api/customers?${qs.toString()}`);
        if (!cancelled) setRows(data.customers || []);
      } catch (e) {
        if (!cancelled) setErr(String(e.message || e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [debouncedQ, status, debouncedMin, debouncedMax]);

  const totals = useMemo(() => {
    const sum = rows.reduce((s, x) => s + Number(x.Total_Price || 0), 0);
    return { count: rows.length, amount: sum };
  }, [rows]);

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h2 style={{ margin: 0 }}>Customers</h2>
          <div style={{ color: "#6b7280", marginTop: 6 }}>
            {loading ? "Loading..." : `${totals.count} customer(s) • ${money(totals.amount)}`}
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <Link to="/dashboard">← Dashboard</Link>
        </div>
      </div>

      <div style={{ height: 12 }} />

      <div
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 16,
          padding: 12,
          background: "#fff",
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: 10,
        }}
      >
        <div>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>Search</div>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="name / email / pay_token / medication"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>Status</div>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          >
            <option>All</option>
            <option>Paid</option>
            <option>Unpaid</option>
          </select>
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>Min Amount</div>
          <input
            value={min}
            onChange={(e) => setMin(e.target.value)}
            placeholder="e.g. 10"
            inputMode="decimal"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </div>

        <div>
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>Max Amount</div>
          <input
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="e.g. 200"
            inputMode="decimal"
            style={{ width: "100%", padding: 10, marginTop: 6 }}
          />
        </div>
      </div>

      <div style={{ height: 12 }} />

      {err && <p style={{ color: "crimson" }}>{err}</p>}

      <div style={{ overflowX: "auto", border: "1px solid #e5e7eb", borderRadius: 16 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f9fafb", textAlign: "left" }}>
              <th style={{ padding: 10 }}>Patient</th>
              <th style={{ padding: 10 }}>Email</th>
              <th style={{ padding: 10 }}>Medication</th>
              <th style={{ padding: 10 }}>Total</th>
              <th style={{ padding: 10 }}>Status</th>
              <th style={{ padding: 10 }}>Invoice</th>
            </tr>
          </thead>

          <tbody>
            {rows.map((x) => (
              <tr key={x.Pay_Token} style={{ borderTop: "1px solid #e5e7eb" }}>
                <td style={{ padding: 10 }}>
                  <div style={{ fontWeight: 800 }}>{x.Patient_Name || "-"}</div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>{x.Practice_Name || "-"}</div>
                  <div style={{ color: "#6b7280", fontSize: 12 }}>{x.Pay_Token}</div>
                </td>
                <td style={{ padding: 10 }}>{x.Patient_Email || "-"}</td>
                <td style={{ padding: 10, maxWidth: 320 }}>
                  <div style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {x.Medication_Prescriber || "-"}
                  </div>
                </td>
                <td style={{ padding: 10 }}>{money(Number(x.Total_Price || 0))}</td>
                <td style={{ padding: 10 }}>
                  <Badge status={x.Payment_Status} />
                </td>
                <td style={{ padding: 10 }}>
                  <Link to={`/invoice/${encodeURIComponent(x.Pay_Token)}`}>View</Link>
                </td>
              </tr>
            ))}

            {!loading && rows.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: "#6b7280" }}>
                  No customers found for your filters.
                </td>
              </tr>
            )}

            {loading && (
              <tr>
                <td colSpan={6} style={{ padding: 12, color: "#6b7280" }}>
                  Loading…
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 10, color: "#6b7280", fontSize: 13 }}>
        Tip: search is debounced by 350ms to keep it fast.
      </p>
    </div>
  );
}
