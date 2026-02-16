import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { apiGet } from "../api.js";
import { money } from "../utils/money.js";

import { apiPost } from "../api.js";
import { useNavigate } from "react-router-dom";




function StatCard({ title, amount, count, tone = "neutral", to }) {
  const toneMap = {
    neutral: { bg: "#111827", fg: "white", sub: "rgba(255,255,255,.75)" },
    success: { bg: "#052e16", fg: "white", sub: "rgba(255,255,255,.75)" },
    danger: { bg: "#450a0a", fg: "white", sub: "rgba(255,255,255,.75)" },
  };
  const t = toneMap[tone] || toneMap.neutral;

  return (
    <Link to={to} style={{ textDecoration: "none" }}>
      <div
        style={{
          borderRadius: 16,
          padding: 16,
          background: t.bg,
          color: t.fg,
          boxShadow: "0 10px 30px rgba(0,0,0,.15)",
          minHeight: 120,
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
        }}
      >
        <div style={{ fontWeight: 800, fontSize: 14, letterSpacing: 0.2 }}>{title}</div>

        <div>
          <div style={{ fontWeight: 900, fontSize: 28, marginTop: 8 }}>
            {money(amount)}
          </div>
          <div style={{ marginTop: 6, color: t.sub, fontSize: 13 }}>
            {count} customer{count === 1 ? "" : "s"}
          </div>
        </div>

        <div style={{ marginTop: 10, color: t.sub, fontSize: 12 }}>
          View list →
        </div>
      </div>
    </Link>
  );
}

function Chip({ label, value }) {
  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 999,
        padding: "8px 12px",
        fontSize: 13,
        display: "flex",
        gap: 8,
        alignItems: "center",
        background: "#fff",
      }}
    >
      <span style={{ color: "#6b7280", fontWeight: 800 }}>{label}</span>
      <span style={{ fontWeight: 900, color: "#111827" }}>{value}</span>
    </div>
  );
}

// Simple donut chart (SVG)
function Donut({ percent = 0, labelTop, labelBottom }) {
  const p = Math.max(0, Math.min(100, percent));
  const r = 44;
  const c = 2 * Math.PI * r;
  const dash = (p / 100) * c;

  return (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        padding: 14,
        background: "#fff",
      }}
    >
      <div style={{ fontWeight: 900, marginBottom: 8 }}>{labelTop}</div>

      <div style={{ display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        <svg width="120" height="120" viewBox="0 0 120 120">
          {/* background ring */}
          <circle cx="60" cy="60" r={r} fill="none" stroke="#e5e7eb" strokeWidth="12" />
          {/* progress ring */}
          <circle
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke="#111827"
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform="rotate(-90 60 60)"
          />
          <text x="60" y="56" textAnchor="middle" fontSize="22" fontWeight="900" fill="#111827">
            {Math.round(p)}%
          </text>
          <text x="60" y="76" textAnchor="middle" fontSize="12" fontWeight="700" fill="#6b7280">
            {labelBottom}
          </text>
        </svg>

        <div style={{ flex: "1 1 260px" }}>
          <div style={{ color: "#6b7280", fontSize: 13, marginBottom: 6 }}>
            {labelBottom} progress
          </div>
          <div
            style={{
              height: 12,
              borderRadius: 999,
              background: "#e5e7eb",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                height: "100%",
                width: `${p}%`,
                background: "#111827",
              }}
            />
          </div>

          <div style={{ marginTop: 10, color: "#6b7280", fontSize: 12 }}>
            Tip: Click the cards above to open filtered lists.
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardV2() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [summary, setSummary] = useState(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const data = await apiGet("/api/summary");
      setSummary(data);
    } catch (e) {
      setErr(String(e.message || e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  const derived = useMemo(() => {
    if (!summary) return null;

    const allCount = Number(summary.all.count || 0);
    const paidCount = Number(summary.paid.count || 0);
    const unpaidCount = Number(summary.unpaid.count || 0);

    const allAmount = Number(summary.all.amount || 0);
    const paidAmount = Number(summary.paid.amount || 0);
    const unpaidAmount = Number(summary.unpaid.amount || 0);

    const paidPctCount = allCount ? (paidCount / allCount) * 100 : 0;
    const paidPctAmount = allAmount ? (paidAmount / allAmount) * 100 : 0;

    return {
      allCount,
      paidCount,
      unpaidCount,
      allAmount,
      paidAmount,
      unpaidAmount,
      paidPctCount,
      paidPctAmount,
      avgBillAll: allCount ? allAmount / allCount : 0,
      avgBillPaid: paidCount ? paidAmount / paidCount : 0,
      avgBillUnpaid: unpaidCount ? unpaidAmount / unpaidCount : 0,
    };
  }, [summary]);

  // inside component
const nav = useNavigate();
async function logout() {
  await apiPost("/api/admin/logout");
  nav("/admin/login");
}

  return (
    <div>
      <button onClick={logout} style={{ padding: "10px 14px" }}>Logout</button>

      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginTop: 48 }}>
        <div>
          <h2 style={{ margin: 0 }}>Dashboard</h2>
          <div style={{ color: "#6b7280", marginTop: 6 }}>
            Billing overview + payment progress
          </div>
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          <button onClick={load} style={{ padding: "10px 14px" }}>
            Refresh
          </button>
          <Link to="/status">Public Status Page</Link>
        </div>
      </div>

      <div style={{ height: 14 }} />

      {loading && <p>Loading...</p>}
      {err && <p style={{ color: "crimson" }}>{err}</p>}

      {!loading && !err && summary && derived && (
        <>
          {/* Big cards */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
              gap: 12,
            }}
          >
            <StatCard
              title="Total Billing"
              amount={summary.all.amount}
              count={summary.all.count}
              tone="neutral"
              to="/customers?status=All"
            />
            <StatCard
              title="Total Paid"
              amount={summary.paid.amount}
              count={summary.paid.count}
              tone="success"
              to="/customers?status=Paid"
            />
            <StatCard
              title="Total Unpaid"
              amount={summary.unpaid.amount}
              count={summary.unpaid.count}
              tone="danger"
              to="/customers?status=Unpaid"
            />
          </div>

          <div style={{ height: 14 }} />

          {/* Chips */}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            <Chip label="Paid (by count)" value={`${Math.round(derived.paidPctCount)}%`} />
            <Chip label="Paid (by amount)" value={`${Math.round(derived.paidPctAmount)}%`} />
            <Chip label="Avg bill" value={money(derived.avgBillAll)} />
            <Chip label="Avg paid" value={money(derived.avgBillPaid)} />
            <Chip label="Avg unpaid" value={money(derived.avgBillUnpaid)} />
          </div>

          <div style={{ height: 12 }} />

          {/* Graphs */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              gap: 12,
            }}
          >
            <Donut
              percent={derived.paidPctCount}
              labelTop="Payment Rate (Customers)"
              labelBottom="Paid"
            />
            <Donut
              percent={derived.paidPctAmount}
              labelTop="Payment Rate (Amount)"
              labelBottom="Paid"
            />
          </div>
        </>
      )}
    </div>
  );
}
