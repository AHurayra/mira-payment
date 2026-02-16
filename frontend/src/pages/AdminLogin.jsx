import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiPost } from "../api.js";

export default function AdminLogin() {
  const nav = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiPost("/api/admin/login", { password });
      nav("/dashboard");
    } catch (err) {
      alert(err.message || String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", border: "1px solid #e5e7eb", borderRadius: 16, padding: 16 }}>
      <h2 style={{ marginTop: 0 }}>Admin Login</h2>
      <p style={{ color: "#6b7280" }}>Enter your admin password to access the dashboard.</p>

      <form onSubmit={submit} style={{ display: "grid", gap: 10 }}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          style={{ padding: 10 }}
        />
        <button disabled={loading} style={{ padding: "10px 14px" }}>
          {loading ? "Logging in..." : "Login"}
        </button>
      </form>
    </div>
  );
}
