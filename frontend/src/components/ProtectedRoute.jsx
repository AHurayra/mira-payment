import React, { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { apiGet } from "../api.js";

export default function ProtectedRoute({ children }) {
  const [checking, setChecking] = useState(true);
  const [ok, setOk] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiGet("/api/admin/me");
        if (!cancelled) setOk(!!res.ok);
      } catch {
        if (!cancelled) setOk(false);
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (checking) return <p>Checking access…</p>;
  if (!ok) return <Navigate to="/admin/login" replace />;
  return children;
}
